Production integration V2.
V1 failed only because actions/checkout fetch-depth 2 made the ancestry guard
unable to prove old main as an ancestor. V2 uses fetch-depth 0.
Runtime integration content is unchanged from V1.
V3 Telegram network remains OFF; validated signal and live probability remain OFF.
After candidate CI succeeds, the owner launcher fast-forwards main and runs one
controlled_no_telegram production smoke.
