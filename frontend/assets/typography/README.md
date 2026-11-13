# 字体候选资产 · 2026-10-29

本目录仅供两页字体试稿与对比页使用。默认平台不启用候选方案。5个WOFF2文件合计1,021,080字节；无需访问外部字体服务。

| 衍生字体 / 文件 | 原字体 | 原始来源 | 许可文件 |
|---|---|---|---|
| Marine Trial Sans / sans-trial.woff2 | Noto Sans SC | 本机C:/Windows/Fonts/NotoSansSC-VF.ttf | sans-OFL.txt |
| Marine Trial Serif / serif-trial.woff2 | Noto Serif SC | 本机C:/Windows/Fonts/NotoSerifSC-VF.ttf | serif-OFL.txt |
| Marine Trial Plex / plex-trial.woff2 | IBM Plex Sans | Google Fonts官方仓库ofl/ibmplexsans/IBMPlexSans[wdth,wght].ttf | plex-OFL.txt |
| Marine Trial Source / source-trial.woff2 | Source Serif 4 | Google Fonts官方仓库ofl/sourceserif4/SourceSerif4[opsz,wght].ttf | source-OFL.txt |
| Marine Trial Barlow / barlow-trial.woff2 | Barlow Condensed SemiBold | Google Fonts官方仓库ofl/barlowcondensed/BarlowCondensed-SemiBold.ttf | barlow-OFL.txt |

官方字体/许可目录：[Noto Sans SC](https://github.com/google/fonts/tree/main/ofl/notosanssc)、[Noto Serif SC](https://github.com/google/fonts/tree/main/ofl/notoserifsc)、[IBM Plex Sans](https://github.com/google/fonts/tree/main/ofl/ibmplexsans)、[Source Serif 4](https://github.com/google/fonts/tree/main/ofl/sourceserif4)、[Barlow Condensed](https://github.com/google/fonts/tree/main/ofl/barlowcondensed)。许可正文逐一随包保留；字体内部原版权、许可记录也保留。

这些是经fontTools 4.68.0转换、按当前前端HTML/JS及数据JSON字符生成的子集，并非完整中文字库。新增界面字符可能回退到系统字体，确定最终方案后应评估生产字库覆盖；不要将本试稿当作已完成全站字体迁移。

为区分衍生文件，已重命名family/full/PostScript/typographic family/variation prefix，不使用原保留名称作为新字体名称。manifest.json记录原版本、实际源路径或URL、源SHA256、文件大小及数字宽度/tnum证据。Plex默认数字等宽；Source支持tnum；Barlow默认数字宽度不等，DOM关键数字显式启用tabular-nums。图表同步字体与字号，Canvas不额外承诺OpenType数字特性。

生成脚本：C:/Users/38793/Documents/比赛/.planning/typography-20261029/build_fonts.py；构建依赖单独存于同目录py-lib，未修改系统Python安装。中文字体取自上面的本机源，Latin原始文件与构建记录存于font-originals。运行脚本可能访问官方原址下载Latin字体与许可，不是离线重建器；已生成的前端资源可以离线运行。
