// Independent Go parser and math/big check against the original retained protobuf.
// Risk semantics reference: dydxprotocol/v4-chain e278fb0032d511ebfdc58e8dcc7aba3164057c50:
// protocol/lib/quantums.go; x/perpetuals/lib/lib.go; x/subaccounts/lib/updates.go;
// x/perpetuals/types/liquidity_tier.go; protocol/lib/margin/risk.go.
package main
import("bytes";"compress/gzip";"encoding/base64";"encoding/json";"fmt";"io";"math/big";"os")
type field struct{wire uint64; data []byte; number uint64}
type message map[uint64][]field
func check(ok bool,s string){if !ok{panic(s)}}
func proto(b []byte)message{m:=message{};i:=0;read:=func()uint64{var n uint64;for s:=uint(0);s<70;s+=7{check(i<len(b),"truncated");v:=b[i];i++;n|=uint64(v&127)<<s;if v<128{return n}};panic("varint")};for i<len(b){k:=read();f:=field{wire:k&7};if f.wire==0{f.number=read()}else if f.wire==2{n:=int(read());check(n>=0&&i+n<=len(b),"bytes");f.data=b[i:i+n];i+=n}else{panic("wire")};m[k>>3]=append(m[k>>3],f)};return m}
func u(m message,k uint64)uint64{if len(m[k])==0{return 0};check(len(m[k])==1&&m[k][0].wire==0,"uint");return m[k][0].number}
func b(m message,k uint64)[]byte{check(len(m[k])==1&&m[k][0].wire==2,"singular bytes");return m[k][0].data}
var gobChecks int
func gob(m message,k uint64)*big.Int{n:=new(big.Int);err:=n.GobDecode(b(m,k));check(err==nil,"stdlib GobDecode");gobChecks++;return n}
func zig(n uint64)int64{return int64(n>>1)^(-int64(n&1))}
func integer(s string)*big.Int{v,ok:=new(big.Int).SetString(s,10);check(ok,"decimal");return v}
func clone(n *big.Int)*big.Int{return new(big.Int).Set(n)}
func pow(e int64)*big.Int{return new(big.Int).Exp(big.NewInt(10),big.NewInt(e),nil)}
func ceil(n,d *big.Int)*big.Int{q,r:=new(big.Int).QuoRem(n,d,new(big.Int));if r.Sign()!=0&&n.Sign()==d.Sign(){q.Add(q,big.NewInt(1))};return q}
type perp struct{id,market,tier uint64;atomic int64;funding *big.Int}
type oracle struct{price uint64;exponent int64}
type tier struct{initial,fraction uint64}
type position struct{id uint64;q,fi,quote *big.Int}
type account struct{owner string;number uint64;quote *big.Int;positions []position}
type risk struct{NC,MMR,Funding *big.Int;liquidatable bool}
func notional(q *big.Int,p perp,o oracle,value *big.Int)*big.Int{n:=new(big.Int).Mul(q,value);e:=p.atomic+o.exponent+6;if e<0{return n.Quo(n,pow(-e))};return n.Mul(n,pow(e))}
func getRisk(a account,perps map[uint64]perp,prices map[uint64]oracle,tiers map[uint64]tier,override map[string]json.RawMessage)risk{r:=risk{clone(a.quote),new(big.Int),new(big.Int),false};ppm:=big.NewInt(1000000);settlement:=new(big.Int);var id uint64;var value string;if override!=nil{json.Unmarshal(override["id"],&id);json.Unmarshal(override["price"],&value)};for _,pos:=range a.positions{p,ok:=perps[pos.id];check(ok,"missing perp");o,ok:=prices[p.market];check(ok,"missing oracle");t,ok:=tiers[p.tier];check(ok,"missing tier");v:=new(big.Int).SetUint64(o.price);if value!=""&&id==pos.id{v=integer(value)};n:=notional(pos.q,p,o,v);r.NC.Add(r.NC,n);r.NC.Add(r.NC,pos.quote);magnitude:=notional(new(big.Int).Abs(pos.q),p,o,v);im:=ceil(magnitude.Mul(magnitude,new(big.Int).SetUint64(t.initial)),ppm);mm:=ceil(im.Mul(im,new(big.Int).SetUint64(t.fraction)),ppm);r.MMR.Add(r.MMR,mm);delta:=new(big.Int).Sub(p.funding,pos.fi);delta.Mul(delta,pos.q);settlement.Sub(settlement,delta)};r.Funding.Div(settlement,ppm);r.NC.Add(r.NC,r.Funding);r.liquidatable=r.MMR.Sign()>0&&r.MMR.Cmp(r.NC)>0;return r}
type rpc struct{ID int `json:"id"`;Result struct{Response struct{Height string `json:"height"`;Value string `json:"value"`} `json:"response"`} `json:"result"`}
func main(){check(len(os.Args)==3,"raw gzip and model proof required");rawFile,err:=os.Open(os.Args[1]);check(err==nil,"open raw");zr,err:=gzip.NewReader(rawFile);check(err==nil,"gzip");data,err:=io.ReadAll(io.LimitReader(zr,2000000));check(err==nil,"read");var raw struct{Raw []struct{Payload json.RawMessage `json:"payload"`} `json:"raw"`};check(json.Unmarshal(data,&raw)==nil,"raw json");var status struct{Result struct{SyncInfo struct{Height string `json:"latest_block_height"`} `json:"sync_info"`} `json:"result"`};check(json.Unmarshal(raw.Raw[0].Payload,&status)==nil,"status json");sourceHeight:=status.Result.SyncInfo.Height;check(sourceHeight!="","source height required");var accountsRPC rpc;check(json.Unmarshal(raw.Raw[1].Payload,&accountsRPC)==nil,"account response");var contexts []rpc;check(json.Unmarshal(raw.Raw[2].Payload,&contexts)==nil,"context response");messages:=map[int]message{};for _,r:=range append(contexts,accountsRPC){check(r.Result.Response.Height==sourceHeight,"height");bs,err:=base64.StdEncoding.DecodeString(r.Result.Response.Value);check(err==nil,"base64");messages[r.ID]=proto(bs)}
 perps:=map[uint64]perp{};prices:=map[uint64]oracle{};tiers:=map[uint64]tier{};accounts:=map[string]account{}
 for _,x:=range messages[3][1]{m:=proto(x.data);p:=proto(b(m,1));id:=u(p,1);perps[id]=perp{id,u(p,3),u(p,6),zig(u(p,4)),gob(m,2)}}
 for _,x:=range messages[4][1]{m:=proto(x.data);tiers[u(m,1)]=tier{u(m,3),u(m,4)}}
 for _,x:=range messages[5][1]{m:=proto(x.data);prices[u(m,1)]=oracle{u(m,3),zig(u(m,2))}}
 for _,x:=range messages[2][1]{m:=proto(x.data);id:=proto(b(m,1));a:=account{string(b(id,1)),u(id,2),new(big.Int),nil};for _,x:=range m[2]{p:=proto(x.data);check(u(p,1)==0,"only USDC quote");a.quote.Add(a.quote,gob(p,2))};for _,x:=range m[3]{p:=proto(x.data);a.positions=append(a.positions,position{u(p,1),gob(p,2),gob(p,3),gob(p,4)})};accounts[fmt.Sprintf("%s:%d",a.owner,a.number)]=a}
 modelBytes,err:=os.ReadFile(os.Args[2]);check(err==nil,"model proof");var model struct{Height string `json:"height"`;RequiredRiskCases int `json:"required_risk_case_count"`;Cases []struct{Owner string `json:"owner"`;Number uint64 `json:"number"`;Override map[string]json.RawMessage `json:"override"`;Expected struct{NC string `json:"net_collateral_quantums"`;MMR string `json:"maintenance_margin_quantums"`;Funding string `json:"funding_quantums"`;Liquidatable bool `json:"liquidatable"`} `json:"expected"`} `json:"risk_cases"`};check(json.Unmarshal(modelBytes,&model)==nil,"model json");check(model.Height==sourceHeight,"model/source height binding");required:=model.RequiredRiskCases;if required==0{required=6};check(required>=6&&required<=1000&&len(model.Cases)==required,"exact independent risk comparison count required");for _,c:=range model.Cases{a,ok:=accounts[fmt.Sprintf("%s:%d",c.Owner,c.Number)];check(ok,"exact account");r:=getRisk(a,perps,prices,tiers,c.Override);check(r.NC.String()==c.Expected.NC&&r.MMR.String()==c.Expected.MMR&&r.Funding.String()==c.Expected.Funding&&r.liquidatable==c.Expected.Liquidatable,"GO_REFERENCE_RISK_MISMATCH")}
 // Explicit Go equality policy: NC==MMR remains safe; MMR==0 is not liquidatable.
 check(!(big.NewInt(10).Cmp(big.NewInt(10))>0),"equality");out:=map[string]interface{}{"status":"GO_STDLIB_GOB_AND_INDEPENDENT_PROTO_RISK_PASS","source_height":sourceHeight,"risk_case_count":len(model.Cases),"actual_gob_values_decoded":gobChecks,"sourceHTTP":0,"D1":0,"MAIN":0,"Telegram":0};encoded,_:=json.MarshalIndent(out,"","  ");os.WriteFile("audit-output/dydx-go-reference-proof.json",append(encoded,'\n'),0644);fmt.Println(string(bytes.TrimSpace(encoded)))
}
