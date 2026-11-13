# -*- coding: utf-8 -*-
"""DCN真实参考站替换回归：跨源一致、完整历史、缺测与离线，不写业务数据。"""
import pathlib
import socket
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import server


class OffshoreSiteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.sync_sites_from_farm()
        cls.site = next(s for s in server.SITES if s['site_id'] == 'site_03')

    def test_cage_and_station_identity_agree(self):
        farm = server.FARM.data['sites']
        site = next(s for s in farm if s['site_id'] == 'site_03')
        for value in (site, self.site):
            self.assertEqual(value['station_id'], 'DCN')
            self.assertEqual(value['sea'], '东海')
            self.assertIn('大陈外海', value['site_name'])
            self.assertEqual((value['latitude'], value['longitude']), (28.5, 121.9))
        self.assertEqual(server.FARM.cage('cage_02')['site_id'], 'site_03')
        self.assertEqual(server.nmdis.SITE_TO_STATION['site_03'], 'DCN')

    def test_full_history_uses_dcn_and_keeps_missing_waves(self):
        data = server.nmdis.load_station('DCN')
        self.assertIsNotNone(data)
        rows = data['records']
        self.assertEqual(len(rows), 10248)
        self.assertEqual(len({r['ts'] for r in rows}), len(rows))
        self.assertEqual({r['station'] for r in rows}, {'DCN'})
        self.assertEqual((rows[0]['ts_local'], rows[-1]['ts_local']),
                         ('2024-07-01 00:00', '2025-08-31 23:00'))
        self.assertEqual(sum(r.get('wave_height') is None for r in rows), 291)
        history = server.envapi.historical('site_03', rows[0]['ts'], rows[-1]['ts'])
        self.assertEqual(history['count'], len(rows))
        self.assertIn('大陈', history['source_detail'])
        self.assertIn('非网箱现场实测', history['reference_note'])
        self.assertEqual(sum(r['wave_height'] is None for r in history['records']), 291)

    def test_runtime_reads_local_data_and_does_not_invent_fields(self):
        with mock.patch.object(socket.socket, 'connect', side_effect=AssertionError('network')):
            env = server.nmdis.as_env(self.site, 1440)
        self.assertIn('大陈', env['source_detail'])
        self.assertIn('非网箱现场实测', env['reference_note'])
        self.assertTrue(env['fast'])
        self.assertTrue(all(r['source'] == 'public' for r in env['fast']))
        for row in env['fast']:
            self.assertIsNone(row['current_speed'])
            self.assertIsNone(row['light_intensity'])
            self.assertIsNone(row['dissolved_oxygen'])

    def test_water_quality_is_reassociated_to_dachen(self):
        self.assertEqual(server.waterquality.SITE_FILE['site_03'], 'DCN.json')
        data = server.waterquality.load('site_03')
        self.assertEqual(data['station_id'], 'DCN')
        self.assertTrue(data['records'])
        self.assertTrue(data['sites'])
        self.assertTrue(all(s['sea'] == '东海' and s['dist_km'] <= 60
                            and 27 < s['lat'] < 30 for s in data['sites']))
        self.assertIn('不是养殖现场实测', data['relation'])


if __name__ == '__main__':
    unittest.main()
