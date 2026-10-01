export const LIQUIDATION_COMMAND_ROUTER_VERSION='liquidation-command-router-v2-20261001';
const normalize=value=>String(value??'').toLowerCase().replaceAll('ё','е').replace(/[^\p{L}\p{N}\-\s]/gu,' ').replace(/\s+/g,' ').trim();
const negative=text=>/(?:^|\s)(?:не|нет|отмени|отмена|останови|не надо|не нужно)(?:\s|$)/u.test(text);
const liquidation=text=>/(?:ликвида\S*|ликва\S*|ликвид(?!ност)\S*)/u.test(text);
const action=text=>/(?:запуст\S*|найд\S*|покаж\S*|проверь\S*|созда\S*|сдела\S*|ищ\S*|посмотр\S*|открой\S*|вывед\S*|дай|где|анализ\S*|поиск\S*|блок|карт\S*)/u.test(text);
function contractFrom(text){
 const upper=text.toUpperCase(),exact=upper.match(/(?:^|\s)([\p{L}\p{N}]{1,15})[-_\/ ]USDT(?:\s|$)/u);if(exact)return`${exact[1]}-USDT`;
 const after=upper.match(/(?:ПО|ДЛЯ|МОНЕТ[АЫЕУ]?|ТИКЕР)\s+([A-Z0-9]{2,15})(?:\s|$)/u);if(after&&!['USDT'].includes(after[1]))return`${after[1]}-USDT`;
 const trailing=upper.match(/(?:ЛИКВИДА\S*|ЛИКВА\S*|ЛИКВИД(?!НОСТ)\S*)\s+([A-Z0-9]{2,15})(?:\s|$)/u);if(trailing&&!['USDT'].includes(trailing[1]))return`${trailing[1]}-USDT`;
 const before=upper.match(/(?:^|\s)([A-Z0-9]{2,15})\s+(?:НА\s+)?(?:ЛИКВИДА\S*|ЛИКВА\S*|ЛИКВИД(?!НОСТ)\S*)/u);if(before&&!['USDT'].includes(before[1]))return`${before[1]}-USDT`;
 return null;
}
export function parseLiquidationCommand(value){
 const text=normalize(value);if(!text)return{matched:false,mode:null,contract:null,reason:'EMPTY'};
 if(negative(text)&&liquidation(text))return{matched:false,mode:null,contract:null,reason:'NEGATED'};
 if(!liquidation(text)||!action(text))return{matched:false,mode:null,contract:null,reason:'NOT_LIQUIDATION_COMMAND'};
 const contract=contractFrom(text);return{version:LIQUIDATION_COMMAND_ROUTER_VERSION,matched:true,mode:contract?'EXACT_COIN_LIQUIDATIONS':'LIQUIDATION_CANDIDATES',contract,normalized:text};
}
export default{parseLiquidationCommand};
