(function(global){
 'use strict';
 const variant=new URLSearchParams(location.search).get('typography');
 if(!['instrument','academic','industrial'].includes(variant))return;
 document.documentElement.dataset.typographyTrial=variant;
 const body='"Marine Trial Sans", "Microsoft YaHei", sans-serif';
 const data=variant==='academic'?'"Marine Trial Source"':variant==='industrial'?'"Marine Trial Barlow"':'"Marine Trial Plex"';
 const scope='.content[data-page="/overview"],.content[data-page="/fish/growth"]';
 const init=global.echarts.init;
 global.echarts.init=function(){
  const chart=init.apply(this,arguments),set=chart.setOption.bind(chart);
  chart.setOption=function(option){
   const args=Array.from(arguments);
   if(chart.getDom().closest(scope)){
    const small=!!chart.getDom().closest('.show-overview');
    option=Object.assign({},option,{textStyle:Object.assign({},option.textStyle,{fontFamily:body,fontSize:14,fontWeight:450})});
    if(option.legend){
     const list=Array.isArray(option.legend)?option.legend:[option.legend];
     const changed=list.map(x=>Object.assign({},x,{textStyle:Object.assign({},x.textStyle,{fontFamily:body,fontSize:small?13:15,fontWeight:500})}));
     option.legend=Array.isArray(option.legend)?changed:changed[0];
    }
    for(const key of ['xAxis','yAxis'])if(option[key]){
     const axis=Array.isArray(option[key])?option[key]:[option[key]];
     const changed=axis.map(x=>Object.assign({},x,{axisLabel:Object.assign({},x.axisLabel,{fontFamily:key==='yAxis'?data:body,fontSize:small?13:14,fontWeight:500,hideOverlap:true}),...(small?{splitNumber:2}:{})}));
     option[key]=Array.isArray(option[key])?changed:changed[0];
    }
    if(small&&option.grid){
     const list=Array.isArray(option.grid)?option.grid:[option.grid];
     const changed=list.map(x=>Object.assign({},x,{top:30,bottom:24,left:42,right:Array.isArray(option.yAxis)&&option.yAxis.length>1?42:12}));
     option.grid=Array.isArray(option.grid)?changed:changed[0];
    }
    if(option.tooltip){
     const list=Array.isArray(option.tooltip)?option.tooltip:[option.tooltip];
     const changed=list.map(x=>Object.assign({},x,{textStyle:Object.assign({},x.textStyle,{fontFamily:body,fontSize:14})}));
     option.tooltip=Array.isArray(option.tooltip)?changed:changed[0];
    }
    if(option.series)option.series=option.series.map(s=>s.markLine?Object.assign({},s,{markLine:Object.assign({},s.markLine,{label:Object.assign({},s.markLine.label,{fontFamily:body,fontSize:13})})}):s);
    args[0]=option;
   }
   return set.apply(chart,args);
  };
  return chart;
 };
 const families=['Marine Trial Sans',variant==='academic'?'Marine Trial Serif':null,variant==='academic'?'Marine Trial Source':variant==='industrial'?'Marine Trial Barlow':'Marine Trial Plex'].filter(Boolean);
 global.TypographyTrial={variant,ready:Promise.all(families.map(f=>document.fonts.load('500 20px "'+f+'"'))).then(()=>{
  document.documentElement.dataset.typographyReady='true';
  for(const el of document.querySelectorAll(scope.split(',').map(s=>s+' .chart').join(','))){const c=global.echarts.getInstanceByDom(el);if(c&&!c.isDisposed())c.setOption(c.getOption(),true);}
 })};
})(window);
