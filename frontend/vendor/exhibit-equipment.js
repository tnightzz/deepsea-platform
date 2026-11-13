// Dimensions are metres. References are comparison models, not confirmed installed equipment.
window.MarineEquipmentSpec={
 water:{size:[.0762,.4287,.0762],evidence:'厂家参考尺寸，实配型号待确认',reference:'YSI EXO2s'},
 camera:{size:[.05,.05,.11],evidence:'厂家参考尺寸，实配型号待确认',reference:'YingDiGe HS-XSX-02-A-W-SS'},
 feed:{size:[.508,1.016,.5588],evidence:'塘用投饵机本体量级参考，海上实配待确认',reference:'Pentair AX70DL'},
 light:{size:[.12,.377,.12],evidence:'厂家2020款参考尺寸，实配待确认',reference:'AKVA Aurora SubLED 100W'},
 crane:{size:[.8,.7,.6],evidence:'量级示意，待厂家总图确认'},
 tension:{size:[.18,.15,.15],evidence:'量级示意，测力卸扣包络待确认'},
 pose:{size:[.08,.05,.06],evidence:'量级示意，型号待确认'},
 energy:{size:[1.5,.05,.7],evidence:'演示设计体量，实配待确认'},
 battery:{size:[.5,.8,.4],evidence:'演示设计体量，实配待确认'}
};
window.addMarineEquipment=function(g){
 const {positions:p,box,tube,face,kind,scale:u,deck,edge}=g;
 // Auxiliary equipment pads extend outboard; the pedestrian path stays clear.
 ['feed','crane','crane_secondary','energy','battery'].forEach(name=>{
  const point=p[name],sign=Math.sign(point[2]),size=window.MarineEquipmentSpec[name==='crane_secondary'?'crane':name].size;
  kind(null);
  box(point[0],deck-.04*u,point[2],(size[0]+.12)*u,.08*u,(size[2]+.12)*u);
  [-.2,.2].forEach(dx=>tube([point[0]+dx*u,deck-.08*u,sign*(edge+.65*u)],[point[0]+dx*u,deck-.08*u,point[2]],'brace'));
 });
 function device(name,point,draw){
  kind(name);
  const pt=(x,y,z)=>[point[0]+x*u,point[1]+y*u,point[2]+z*u];
  const b=(x,y,z,w,h,d,material)=>box(...pt(x,y,z),w*u,h*u,d*u,material);
  const t=(a,c,style)=>tube(pt(...a),pt(...c),style);
  const f=(points,color)=>face(points.map(a=>pt(...a)),color);
  function cylinder(diameter,length,axis,color){
   const axes={x:[0,1,2],y:[1,0,2],z:[2,0,1]}[axis],r=diameter/2;
   const ring=(end)=>Array.from({length:12},(_,i)=>{const a=[];a[axes[0]]=end;a[axes[1]]=Math.cos(i*Math.PI/6)*r;a[axes[2]]=Math.sin(i*Math.PI/6)*r;return a});
   const a=ring(-length/2),c=ring(length/2);
   a.forEach((v,i)=>f([v,a[(i+1)%12],c[(i+1)%12],c[i]],i%2?color:'#78949f'));f(a,'#657f8b');f(c,color);
  }
  draw({b,t,f,cylinder,pt});
 }
 device('feed',p.feed,({b})=>{b(0,0,0,.508,.96,.5588);b(0,.493,0,.508,.03,.5588);b(0,-.493,0,.508,.03,.5588);b(0,.15,.2744,.12,.1,.01,true)});
 kind('feed');tube([p.feed[0],deck,p.feed[2]],p.feed_outlet,'pipe');
 ['water','oxygen'].forEach((name,i)=>{
  const point=i?p.oxygen:p.water;
  device('water',point,({cylinder})=>cylinder(.0762,.4287,'y','#a9c0c8'));
  kind('water');tube([point[0],deck,p.water_mount[2]],point,'cable');
 });
 [p.light,p.light_secondary].forEach((point,i)=>{
  device(i?'light-secondary':'light',point,({cylinder})=>cylinder(.12,.377,'y','#c2e9df'));
  kind(i?'light-secondary':'light');tube([point[0],deck,p.light_mount[2]],point,'cable');
 });
 device('camera',p.camera,({cylinder,b})=>{cylinder(.05,.11,'z','#b8d5de');b(0,0,.054,.035,.035,.002,'opening')});
 kind('camera');tube([p.camera[0],deck,p.camera_mount[2]],p.camera,'cable');
 [p.crane,p.crane_secondary].forEach((point,i)=>device(i?'crane-secondary':'crane',point,({b,cylinder})=>{
  b(0,-.30,0,.8,.10,.6);[-.30,.30].forEach(x=>b(x,0,0,.10,.70,.55));cylinder(.44,.60,'x','#9bb4be');
 }));
 device('tension',p.tension,({b,t})=>{b(0,0,0,.18,.15,.15,true);t([0,.15,0],[0,-.15,0],'chain')});
 device('pose',p.pose,({b})=>b(0,0,0,.08,.05,.06,true));
 device('net',p.net,({b})=>b(0,0,0,.18,.15,.15,true));
 kind('energy');[-.5,.5].forEach(dx=>tube([p.energy[0]+dx*u,deck,p.energy[2]],[p.energy[0]+dx*u,p.energy[1]-.025*u,p.energy[2]],'brace'));
 device('energy',p.energy,({b})=>{b(0,0,0,1.5,.05,.7);for(let i=0;i<6;i++)b(-.625+i*.25,.029,0,.22,.008,.64,'opening')});
 device('energy',p.battery,({b})=>{b(0,0,0,.5,.8,.4);b(0,.2,.204,.15,.10,.008,true)});
};
