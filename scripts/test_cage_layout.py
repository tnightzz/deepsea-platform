"""两箱几何和分箱点云回归；不启动刷新，不写台账或观测缓存。"""
import math
import sys
from pathlib import Path
import threading
import unittest
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
import server
from check_captain_data import check_current_cages, get


class CageLayoutTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.load_species_db()
        server.load_temp_db()
        server.sync_sites_from_farm()
        cls.httpd = server.PlatformServer(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:%s' % cls.httpd.server_port

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()

    def setUp(self):
        self.old_sim = dict(server.FISH_SIM)
        server.FISH_SIM.update(gen_status='running', sim_mode='normal')

    def tearDown(self):
        server.FISH_SIM.update(self.old_sim)

    def test_ledger_geometry_and_species(self):
        c1, c2 = (server.FARM.cage(cid) for cid in ('cage_01', 'cage_02'))
        s1, s2 = c1['spec'], c2['spec']
        self.assertEqual((c1['species'], s1.get('plan_shape')), ('大黄鱼', 'square'))
        self.assertEqual((s1['length_m'], s1['width_m'], s1['depth_m']), (18, 18, 6))
        self.assertEqual((s1['effective_volume_m3'], s1.get('circumference_m')), (1944, 72))
        self.assertEqual((c2['species'], s2.get('plan_shape')), ('许氏平鲉', 'hexagon'))
        self.assertEqual(s2.get('across_flats_m'), 20)
        self.assertAlmostEqual(s2.get('side_m', 0), 20 / math.sqrt(3))
        self.assertAlmostEqual(s2['length_m'], 40 / math.sqrt(3))
        self.assertEqual((s2['width_m'], s2['depth_m']), (20, 6))
        self.assertAlmostEqual(s2['effective_volume_m3'], math.sqrt(3) / 2 * 20 ** 2 * 6)
        self.assertAlmostEqual(s2.get('circumference_m', 0), 6 * 20 / math.sqrt(3))
        for spec in (s1, s2):
            self.assertEqual(spec['shape'], '桁架式')

    def test_device_installation_depth_design(self):
        for cid in ('cage_01', 'cage_02'):
            devices = server.FARM.devices(cid)
            light = next(d for d in devices if d['metric'] == 'light_dimming')
            self.assertEqual(light['location'], cid + ' · 水下 3 m')
            if cid == 'cage_02':
                for d in devices:
                    if d['metric'] in ('water_temp', 'dissolved_oxygen'):
                        self.assertEqual(d['location'], cid + ' · 水下 5 m')

    def assert_points_inside(self, data):
        spec = server.FARM.cage(data['cage_id'])['spec']
        self.assertEqual(data['dims'], {'x': spec['length_m'], 'y': spec['width_m'], 'z': spec['depth_m']})
        for p in data['points']:
            self.assertTrue(0 <= p['x'] <= data['dims']['x'])
            self.assertTrue(0 <= p['y'] <= data['dims']['y'])
            self.assertTrue(0 <= p['z'] <= data['dims']['z'])
            if data['plan_shape'] == 'hexagon':
                # 朝左右的正六角：斜边 |x-R| + |y-D/2|/sqrt(3) <= R。
                radius, half_flat = spec['side_m'], spec['across_flats_m'] / 2
                self.assertLessEqual(abs(p['x'] - radius) + abs(p['y'] - half_flat) / math.sqrt(3), radius + 1e-9)

    def test_http_cage_selection_and_different_distributions(self):
        default = get(self.base, '/api/fish/positions3d')['data']
        self.assertEqual(default.get('cage_id'), 'cage_01')
        clouds = []
        for cid in ('cage_01', 'cage_02'):
            result = get(self.base, '/api/fish/positions3d?cage_id=' + cid)
            self.assertFalse(result['offline'])
            data = result['data']
            self.assertEqual(data.get('cage_id'), cid)
            self.assertEqual(data.get('species'), server.FARM.cage(cid)['species'])
            self.assertEqual(data.get('source'), 'simulated')
            self.assert_points_inside(data)
            clouds.append(data)
        means = [sum(p['z'] for p in d['points']) / len(d['points']) for d in clouds]
        self.assertTrue(3.5 < means[0] < 4.8)
        self.assertGreater(means[1], 5.0)
        spreads = [sum((p['x'] / d['dims']['x'] - .5) ** 2 + (p['y'] / d['dims']['y'] - .5) ** 2
                       for p in d['points']) / len(d['points']) for d in clouds]
        self.assertGreater(spreads[1], 2 * spreads[0])
        with self.assertRaises(urllib.error.HTTPError) as caught:
            get(self.base, '/api/fish/positions3d?cage_id=not_a_cage')
        self.assertEqual(caught.exception.code, 404)

    def test_fault_modes_stay_inside_and_keep_offline_behavior(self):
        for mode in ('normal', 'cluster', 'feeding_abnormal', 'density_drop'):
            server.FISH_SIM['sim_mode'] = mode
            for cid in ('cage_01', 'cage_02'):
                data = server.fish_positions_3d(cid)
                self.assert_points_inside(data)
                self.assertEqual(len(data['points']), 650 if mode == 'density_drop' else 1000)
                if mode == 'feeding_abnormal':
                    self.assertTrue(any(p['s'] == 2 for p in data['points']))
        for state, mode in (('stopped', 'normal'), ('running', 'camera_off')):
            server.FISH_SIM.update(gen_status=state, sim_mode=mode)
            for cid in ('cage_01', 'cage_02'):
                self.assertEqual(get(self.base, '/api/fish/positions3d?cage_id=' + cid), {'data': None, 'offline': True})
            with self.assertRaises(urllib.error.HTTPError) as caught:
                get(self.base, '/api/fish/positions3d?cage_id=not_a_cage')
            self.assertEqual(caught.exception.code, 404)
        server.FISH_SIM.update(gen_status='paused', sim_mode='normal')
        self.assertIsNotNone(server.fish_positions_3d('cage_02'))

    def test_http_captain_data_check_accepts_hexagonal_volume(self):
        problems, details = check_current_cages(self.base)
        self.assertEqual(problems, [], '\n'.join(problems))
        self.assertTrue(any('正六角' in detail for detail in details))


if __name__ == '__main__':
    unittest.main(verbosity=2)
