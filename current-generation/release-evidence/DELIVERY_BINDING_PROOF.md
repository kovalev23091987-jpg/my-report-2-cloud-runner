# Delivery binding proof

- Publication and dispatch share immutable publication/run/snapshot/wave/contract/direction/event/generation identities and the same payload hash.
- Telegram success requires a positive message ID and matching recipient.
- Timeout after an ambiguous call becomes `UNKNOWN_DELIVERY`; it is not blindly retried.
- A removal is allowed only for an ENTRY with a confirmed SENT receipt.
- Manual commands are persisted before analytics and claimed with immutable generation/mode/contract validation.
- Liquidation-only, full manual and manual-coin commands complete only after their existing result output has been emitted.

Live relay cutover remains blocked until the exact current Hub bundle and binding names are obtained.
