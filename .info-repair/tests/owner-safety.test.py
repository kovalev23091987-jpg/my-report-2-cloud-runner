import importlib.util,pathlib,unittest
p=pathlib.Path(__file__).resolve().parents[1]/'tools/owner.py'
spec=importlib.util.spec_from_file_location('owner',p);owner=importlib.util.module_from_spec(spec);spec.loader.exec_module(owner)
def proof():return {'schema':'telegram-info-proof-v1','head':'H','candidate_sha':'C','live_probability':None,'validated_signal':False,'execution':False,'automatic_weight_tuning':False,'v3_telegram_network_enabled':False,'output':{'enabled':True,'info_enabled':True,'final_chain_auto':False,'morning':{'status':'SENT','sent':True,'delivery_confirmed':True,'message_id':77},'early_info':{'status':'NO_NEW_WAIT','sent':False}}}
class SafetyTests(unittest.TestCase):
 def test_valid_and_reused_delivery(self):
  p=proof();self.assertTrue(owner.verify_proof(p,'H','C','test'));p['output']['morning']['status']='ALREADY_SENT';p['output']['morning']['sent']=False;self.assertTrue(owner.verify_proof(p,'H','C','test'))
 def test_identity_flags_missing_receipt(self):
  for key,value in [('head','OLD'),('candidate_sha','OTHER'),('execution',True),('validated_signal',None),('live_probability',0),('v3_telegram_network_enabled',True)]:
   p=proof();p[key]=value
   with self.assertRaises(owner.SafetyFailure):owner.verify_proof(p,'H','C','test')
  p=proof();p['output']['morning']['delivery_confirmed']=False
  with self.assertRaises(owner.SafetyFailure):owner.verify_proof(p,'H','C','test')
 def test_no_send_rejects_enabled_network(self):
  with self.assertRaises(owner.SafetyFailure):owner.verify_proof(proof(),'H','C','no-send')
 def test_unknown_result_is_not_sent(self):
  p=proof();p['output']['morning']['status']='INFO_FINALIZE_ACK_UNKNOWN'
  with self.assertRaises(owner.SafetyFailure):owner.verify_proof(p,'H','C','natural')
 def test_natural_log_requires_success_and_all_safety_markers(self):
  log='TELEGRAM_OUTPUT_LAYER {"info_enabled":true,"final_chain_auto":false}\nV3_TELEGRAM_DELIVERY_SIDECAR {"network_send":false}\n{"ok":true}'
  self.assertTrue(owner.verify_natural_log(log))
  for token in ['"info_enabled":true','"final_chain_auto":false','"network_send":false','"ok":true']:
   with self.assertRaises(owner.SafetyFailure):owner.verify_natural_log(log.replace(token,''))
  with self.assertRaises(owner.SafetyFailure):owner.verify_natural_log(log+' REPORT2_RUNNER_FATAL')
  for token in ['INFO_ERROR_FAIL_CLOSED','INFO_ACK_UNKNOWN','INFO_FINALIZE_READBACK_FAILED','INFO_CORRUPT_JOURNAL_STATE','INFO_IDENTITY_COLLISION','INFO_FINAL_AUTO_CONFLICT']:
   with self.assertRaises(owner.SafetyFailure):owner.verify_natural_log(log+' '+token)
 def test_rollback_never_overwrites_another_owner(self):
  o=owner.Installer.__new__(owner.Installer);o.promoted='OUR';o.current=lambda:'NEWER';events=[];o.log=lambda *args:events.append(args);o.git=lambda *args:(_ for _ in ()).throw(AssertionError('GIT_MUST_NOT_RUN'));o.rollback();self.assertEqual(events[0][1],'NOT_ATTEMPTED_MAIN_NOT_OWNED')
 def test_ambiguous_dispatch_posts_only_once(self):
  o=owner.Installer.__new__(owner.Installer);o.tag='test';o.runs=lambda *a:[];calls=[];o.cmd=lambda *a,**k:calls.append(a);o.discover_run=lambda *a:(_ for _ in ()).throw(owner.ObservationFailure('AMBIGUOUS'));o.log=lambda *a:None
  with self.assertRaises(owner.ObservationFailure):o.dispatch('b','h','TEST','test')
  self.assertEqual(len(calls),1)
if __name__=='__main__':unittest.main()
