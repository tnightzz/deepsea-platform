# 告警页面归属与红点实施计划

目标：落实 10-26 分派表队长第 2 项，每条告警有唯一处置入口，一级计数由二级计数相加得到。
用户于 2026-10-28 明确：生产管理也显示红点，低电量计入能源保障及生产管理入口。

## 设计与范围

沿用无构建 Vue、现有 API.alarms()、API.subscribe() 与数字角标样式。
在 app.js 集中保存规则的 handling_page；页面按此计算计数，不增加后端表或接口。
优先按规则 ID 匹配，再按旧 alarm_type 匹配，未知归到 /mgmt/alarm；避免离线 R-CMD-01 曾标成 tension/power_supply 而归错板块。
每个 alarm_status !== recovered 的事件只进入一个二级页面。active、acknowledged、已人工处置但未恢复均计数；点击不清零。
保持原来的全网箱计数范围，总览不挂红点。结构菜单顺序属于第 3 项，本次不改。
沿用 99+ 显示上限，title 保留完整整数，求和使用完整整数。

规则归属：张力、倾角、网衣到监测详情；大浪叠加张力到灾害分级预警；水温到水质；低电量到能源保障；命令失败到指令日志。
兼容类型：鱼类异常到监测总览、密度到热力图；投喂设备到自动投喂、补光设备到智能补光、设备离线到设备状态；其余按既有业务归属。
仅 API.alarms() 中的事件参与导航计数；结构页面对历史序列计算的 hits 是历史命中，不另造 active 告警、也不重复加进导航。

候选做法：分别维护板块及页面映射容易漂移；新增后端规则服务对本项过重；采用一份前端规则映射，板块从页面统计派生。

## 实施与验证

- [x] 新增 scripts/test_alarm_pages.js。用 VM 加载现有 App，验证 14 条实际规则、规则优先、旧类型兜底、未知兜底、唯一计数、管理汇总、确认后仍计数、解除减少、99+ 与完整 title 数值。
- [x] 先运行该测试，记录现有实现不能满足新要求的失败。
- [x] 修改 frontend/app.js：ALARM_RULES 每行 rule_id/handling_page；AlarmRoutes.pageFor(alarm)/labelFor(path)；computed.pageDots 基于 API.alarms()，computed.boardDots 从 pageDots 按路径板块求和；复用数字格式化方法。二级导航和目录增加同一 pageDots 角标；生产管理 TABS 加 board。
- [x] 修改 frontend/pages/mgmt.js：告警列表现有追溯动作旁显示处置入口名称；原处置中心安全切箱逻辑不改。
- [x] 修改 frontend/pages/struct.js：只读规则 rows 增加 handling_page 字段及入口说明，与集中规则表同源；不修改触发阈值或规则名称。
- [x] 修改 frontend/exhibit.css：为目录链接使用 flex，以便角标清晰排列；复用 nav-dot。
- [x] 通过 Node 定向测试及现有 test_captain_1016.js、test_ui_hierarchy.js；执行 acceptance.py（与验收检查.bat 相同入口）。
- [x] 临时独立服务 + 浏览器注入告警，验证各导航层级、生产管理计数、点击不清除、确认不清除、recovered 后下一轮询移除；1366×768/1920×1080 截图、零脚本错误警告及导航不溢出。
- [x] 独立代码复核、修复实际问题，保存规则对照表和验收记录，更新项目进度。

不推送、不合并；保留本地可审查改动。
