"""结构读数→告警→恢复的回归，仅修改测试进程内存。"""
from copy import deepcopy
from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import server


class StructAlarmLocationTests(unittest.TestCase):
    def setUp(self):
        self.platform = server.Platform()
        self.row = server.struct_series(5, storm=True, cage_id='cage_02')[-1]

    def business(self):
        return [a for a in self.platform.alarms if a.get('event_origin') == 'struct_monitor' and a['alarm_status'] != 'recovered']

    def test_seed_examples_are_explicit_and_not_business_events(self):
        self.assertTrue(all(a.get('event_origin') == 'preset_demo' for a in self.platform.alarms))

    def test_actual_readings_create_two_locatable_cage_specific_events(self):
        self.platform.update_struct_alarms(self.row)
        events = self.business()
        self.assertEqual(len(events), 2)
        for a in events:
            self.assertEqual(a['cage_id'], 'cage_02')
            self.assertEqual(a['site_id'], 'site_03')
            self.assertEqual(a['source'], 'simulated')
            self.assertEqual(a['alarm_ts'], self.row['ts'])
            self.assertGreaterEqual(a['trigger_value'], a['trigger_threshold'])
            self.assertEqual(a['trigger_snapshot']['ts'], self.row['ts'])
        tension = next(a for a in events if a['alarm_type'] == 'tension')
        line = next(x for x in self.row['mooring_lines'] if x['chain_id'] == tension['chain_id'])
        self.assertAlmostEqual(tension['trigger_value'], line['anchor_tension']/line['design_tension']*100, places=1)
        tilt = next(a for a in events if a['alarm_type'] == 'tilt')
        self.assertEqual(tilt['trigger_value'], abs(self.row[tilt['trigger_field']]))

    def test_polling_deduplicates_confirmation_does_not_recover_and_cages_are_separate(self):
        self.platform.update_struct_alarms(self.row)
        count = len(self.platform.alarms)
        self.business()[0]['alarm_status'] = 'acknowledged'
        for _ in range(3):
            self.platform.update_struct_alarms(self.row)
        self.assertEqual(len(self.platform.alarms), count)
        self.assertEqual(len(self.business()), 2)
        self.platform.update_struct_alarms(server.struct_series(5, storm=False, cage_id='cage_01')[-1])
        self.assertEqual(len(self.business()), 2)
        self.platform.update_struct_alarms(server.struct_series(5, storm=False, cage_id='cage_02')[-1])
        self.assertEqual(len(self.business()), 0)
        self.assertTrue(all(a.get('recover_ts') for a in self.platform.alarms if a.get('event_origin') == 'struct_monitor'))

    def test_missing_or_stale_values_cannot_falsely_recover(self):
        self.platform.update_struct_alarms(self.row)
        missing = {'ts':self.row['ts']+5000, 'cage_id':'cage_02','site_id':'site_03','quality':'good'}
        self.platform.update_struct_alarms(missing)
        stale = server.struct_series(5, cage_id='cage_02')[-1] | {'quality':'stale'}
        self.platform.update_struct_alarms(stale)
        self.assertEqual(len(self.business()), 2)
        invalid = deepcopy(self.row)
        invalid['cage_id'] = 'cage_99'
        self.platform.update_struct_alarms(invalid)
        self.assertEqual(len(self.business()), 2)

    def test_escalation_preserves_event_identity_until_readings_recover(self):
        yellow = {'ts':1000, 'cage_id':'cage_01', 'site_id':'site_04', 'quality':'good',
                  'source':'simulated', 'tension_pct':85}
        self.platform.update_struct_alarms(yellow)
        event = self.business()[0]
        aid = event['alarm_event_id']
        self.platform.update_struct_alarms(yellow | {'ts':2000, 'tension_pct':98})
        self.assertEqual(len(self.business()), 1)
        self.assertEqual(event['alarm_event_id'], aid)
        self.assertEqual(event['risk_level'], 'red')
        self.assertEqual(event['trigger_value'], 98)
        self.assertEqual(event['trigger_snapshot']['tension_pct'], 98)
        self.platform.update_struct_alarms(yellow | {'ts':3000})
        self.assertEqual(event['alarm_status'], 'active')
        self.platform.update_struct_alarms(yellow | {'ts':4000, 'tension_pct':60})
        self.assertEqual(event['alarm_status'], 'recovered')


if __name__ == '__main__':
    unittest.main(verbosity=2)
