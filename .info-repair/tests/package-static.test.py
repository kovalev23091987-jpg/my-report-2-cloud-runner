import json,pathlib,re,unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]

class PackageStaticTests(unittest.TestCase):
 def test_exact_production_scope_and_disabled_live_features(self):
  manifest=json.loads((ROOT/'MANIFEST.json').read_text())
  self.assertEqual(set(manifest['production_files']),{
   'runner/telegram-output.mjs','runner/telegram-info-runtime.mjs',
   'runner/runner-main.mjs','.github/workflows/report2.yml'})
  wf=(ROOT/'candidate/.github/workflows/report2.yml').read_text()
  for token in ['REPORT2_TELEGRAM_SHADOW_DECISION_AUTO: "0"','REPORT2_TELEGRAM_WATCH70_ENABLED: "0"','REPORT2_V3_TELEGRAM_NETWORK_ENABLED: "0"','REPORT2_TELEGRAM_INFO_ENABLED: "1"']:
   self.assertIn(token,wf)
  self.assertIn('isolated_telegram_validation:',wf)
  self.assertIn("REPORT2_TELEGRAM_INSTALL_VALIDATION: ${{ github.event_name == 'workflow_dispatch' && inputs.isolated_telegram_validation == true && '1' || '0' }}",wf)
  self.assertIn("REPORT2_R8_20_PROSPECTIVE_VALIDATION_ENABLED: ${{ github.event_name == 'workflow_dispatch' && inputs.isolated_telegram_validation == true && '0' || '1' }}",wf)
  self.assertIn("always() && github.event_name == 'workflow_dispatch'",wf)
  self.assertNotIn('wrangler deploy',wf.lower())
 def test_strategy_weights_are_unchanged_and_no_tuning_or_execution(self):
  output=(ROOT/'candidate/runner/telegram-output.mjs').read_text()
  for token in ['["DERIVATIVES_CROSS_VENUE", 35]','["RELATIVE_STRENGTH_SPOT", 30]','["SMART_MONEY_ONCHAIN", 20]','["SUPPORTING_RISK", 15]']:
   self.assertIn(token,output)
  info=(ROOT/'candidate/runner/telegram-info-runtime.mjs').read_text()
  self.assertNotRegex(info,re.compile(r'weight.tun|trade.execution|wrangler deploy',re.I))
  self.assertIn('journalRows:1024',info)
  self.assertIn('rowsRead:1536, rowsWritten:4',info)
  runner=(ROOT/'candidate/runner/runner-main.mjs').read_text()
  self.assertIn('extraRowsRead:INFO_D1_BUDGET.rowsRead',runner)
  self.assertNotIn('extraRowsRead:2560',runner)
  self.assertIn('if (telegramInstallValidation && telegramReportTestRequested)',runner)
  self.assertIn('if (telegramOutput === null)',runner)
  self.assertIn('status:"SKIPPED_OWNER_TELEGRAM_VALIDATION"',runner)
  self.assertIn('source !== "schedule" && !telegramInstallValidation',runner)
  self.assertLess(runner.index('if (telegramInstallValidation && telegramReportTestRequested)'),runner.index('const v3SidecarsPreactionBudget'))
  self.assertLess(runner.index('status:"SKIPPED_OWNER_TELEGRAM_VALIDATION"'),runner.index('if (telegramOutput === null)'))
 def test_owner_route_orders_every_gate_before_promotion(self):
  owner=(ROOT/'tools/owner.py').read_text()
  manifest=json.loads((ROOT/'MANIFEST.json').read_text())
  base=manifest['base_main']
  self.assertIn("BASE='"+base+"'",owner)
  self.assertEqual(owner.count('= '+base),3)
  install=owner[owner.index('    def install(self):'):owner.index('\ndef main():')]
  markers=["self.cmd(['gh','auth','status'])","self.await_run(rid)","'VALIDATION_NO_SEND'","'DELIVERY_TEST'","'REHEARSAL_NO_SEND'","candidate+':main'","'PRODUCTION_NO_SEND_SMOKE'","len(natural)<3"]
  positions=[install.index(x) for x in markers]
  self.assertEqual(positions,sorted(positions))
  self.assertGreaterEqual(owner.count('self.exact_main(BASE)'),3)
  self.assertIn("if not self.promoted or self.current()!=self.promoted",owner)
  self.assertIn("ignore_patterns('evidence','SHA256SUMS'",owner)
  self.assertIn("'-f','isolated_telegram_validation=true'",owner)
 def test_preflight_is_additive_and_telegram_free(self):
  pre=(ROOT/'tools/d1-preflight.mjs').read_text()
  self.assertNotRegex(pre,re.compile(r'\b(?:DROP|ALTER|DELETE)\b',re.I))
  self.assertIn('telegram_sent:false',pre)
  self.assertIn('cardinality.length>2048',pre)
  self.assertIn('rows_read:8192,rows_written:2304',pre)

if __name__=='__main__':unittest.main()
