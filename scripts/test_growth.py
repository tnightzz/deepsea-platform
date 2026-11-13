"""生长计划与跨天仿真历史回归；只改测试进程内存。"""
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import server

DAY = 86400000


def ts(date):
    return datetime.strptime(date, '%Y-%m-%d').replace(tzinfo=timezone.utc).timestamp() * 1000


class GrowthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.load_species_db()
        server.sync_sites_from_farm()

    def setUp(self):
        self.old_sim = dict(server.FISH_SIM)
        server.FISH_SIM.update(gen_status='running', sim_mode='normal')

    def tearDown(self):
        server.FISH_SIM.update(self.old_sim)

    def test_s_shape_endpoints_quarters_monotonic_and_clamping_for_both_cages(self):
        for cage in server.FARM.all_cages():
            st = cage['stocking']
            t0, t1 = ts(st['date']), ts(st['plan_harvest'])
            w0, w1 = st['init_size_g'], st['target_size_g']
            values = [server.planned_weight(cage, t0 + (t1-t0)*i/100) for i in range(101)]
            self.assertEqual(values[0], w0)
            self.assertEqual(values[-1], w1)
            self.assertTrue(all(a <= b for a, b in zip(values, values[1:])))
            self.assertAlmostEqual(values[25], w0+(w1-w0)*0.15625)
            self.assertAlmostEqual(values[75], w0+(w1-w0)*0.84375)
            self.assertEqual(server.planned_weight(cage, t0-DAY), w0)
            self.assertEqual(server.planned_weight(cage, t1+DAY), w1)

    def test_invalid_or_incomplete_plans_have_no_curve(self):
        cage = server.FARM.cage('cage_01')
        for changes in [{'date':''}, {'plan_harvest':'2026-01-01'}, {'init_size_g':None},
                        {'target_size_g':float('nan')}, {'target_size_g':0}]:
            bad = deepcopy(cage)
            bad['stocking'].update(changes)
            self.assertIsNone(server.planned_weight(bad, ts('2026-10-29')))

    @patch('server.time.time', return_value=ts('2026-10-29')/1000 + 12*3600)
    def test_history_is_daily_stable_separate_and_includes_current_sample(self, _clock):
        histories = []
        for cage in server.FARM.all_cages():
            cid = cage['cage_id']
            rows = server.fish_growth_history(cid)
            self.assertGreater(len(rows), 30)
            self.assertEqual(rows, server.fish_growth_history(cid))
            self.assertEqual(rows[0]['ts'], ts(cage['stocking']['date']))
            self.assertEqual(rows[0]['avg_weight_g'], cage['stocking']['init_size_g'])
            self.assertEqual(rows[-1]['ts'], server.fish_series(5, cid)[-1]['ts'])
            self.assertEqual(rows[-1]['avg_weight_g'], server.fish_series(5, cid)[-1]['avg_weight_g'])
            self.assertTrue(all(r['source']=='simulated' and r['cage_id']==cid and r['site_id']==cage['site_id'] for r in rows))
            self.assertTrue(all(a['ts'] < b['ts'] for a,b in zip(rows,rows[1:])))
            self.assertTrue(all(b['ts']-a['ts']==DAY for a,b in zip(rows[:-2],rows[1:-1])))
            self.assertLessEqual(rows[-1]['ts'], server.time.time()*1000)
            histories.append(rows)
        self.assertNotEqual(histories[0][0]['avg_weight_g'], histories[1][0]['avg_weight_g'])
        self.assertEqual(server.fish_growth_history('cage_99'), [])

    def test_offline_current_weight_is_missing_but_daily_simulation_is_labeled(self):
        for state in [{'gen_status':'stopped'}, {'sim_mode':'camera_off'}]:
            with patch.dict(server.FISH_SIM, state):
                rows = server.fish_growth_history('cage_01')
                self.assertIsNone(rows[-1]['avg_weight_g'])
                self.assertEqual(rows[-1]['quality'], 'stale')
                self.assertTrue(all(r['source']=='simulated' for r in rows))
                self.assertTrue(all(r['avg_weight_g'] is not None for r in rows[:-1]))


if __name__ == '__main__':
    unittest.main(verbosity=2)
