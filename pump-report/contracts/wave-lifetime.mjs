export const POST_BREACH_WAVE_VERSION='POST_BREACH_NEW_WAVE_V1';
const time=n=>Number.isSafeInteger(n)&&n>=0;
const positive=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const text=s=>typeof s==='string'&&s.length>0;

// Clock geometry only. The analytics consumer must separately prove the
// closed cause, continuous path, instrument identity and new seed from facts.
export function waveLifetimeValid(wave,at,profile){
  if(!wave||!time(at)||!time(wave.created_ts)||wave.created_ts>at||!time(wave.expires_ts)||
    !Number.isSafeInteger(profile?.wave_max_age_ms)||profile.wave_max_age_ms<=0)return false;
  const anchored=Object.hasOwn(wave,'lifetime_anchor_ts'),proved=Object.hasOwn(wave,'post_breach_rearm');
  if(!anchored&&!proved)return wave.expires_ts===wave.created_ts+profile.wave_max_age_ms;
  if(!anchored||!proved)return false;
  const p=wave.post_breach_rearm,s=wave.impulse;
  return Boolean(time(wave.lifetime_anchor_ts)&&wave.lifetime_anchor_ts<=wave.created_ts&&
    wave.expires_ts===wave.lifetime_anchor_ts+profile.wave_max_age_ms&&
    p&&p.version===POST_BREACH_WAVE_VERSION&&text(wave.wave_id)&&text(p.prior_wave_id)&&p.prior_wave_id!==wave.wave_id&&
    time(p.prior_cancelled_ts)&&p.prior_cancelled_ts<=wave.created_ts&&
    time(p.terminal_event_ts)&&time(p.proof_received_ts)&&p.terminal_event_ts<=p.proof_received_ts&&
    time(p.rearm_decided_ts)&&p.proof_received_ts<=p.rearm_decided_ts&&p.rearm_decided_ts===wave.created_ts&&
    time(p.cause_path_start_ts)&&time(p.breach_open_ts)&&time(p.breach_close_ts)&&
    p.cause_path_start_ts<=p.breach_open_ts&&p.breach_close_ts===p.terminal_event_ts&&
    Number.isSafeInteger(profile.candle_interval_ms)&&profile.candle_interval_ms>0&&
    p.breach_close_ts-p.breach_open_ts===profile.candle_interval_ms&&
    positive(p.protected_base)&&positive(p.breach_low)&&p.breach_low<p.protected_base&&
    text(p.cause_fact_id)&&text(p.cause_evidence_ref)&&
    s&&time(s.start_ts)&&time(s.end_ts)&&s.start_ts>=p.terminal_event_ts&&
    Number.isSafeInteger(profile.impulse_window_ms)&&profile.impulse_window_ms>0&&
    s.end_ts-s.start_ts===profile.impulse_window_ms&&s.end_ts===wave.lifetime_anchor_ts&&s.end_ts<=p.proof_received_ts);
}
