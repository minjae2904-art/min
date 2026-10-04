// Generates PWA icons: three activity rings on black. Run: node scripts-make-icons.js
const zlib = require('zlib'), fs = require('fs');
function crc(buf){let c,t=[];for(let n=0;n<256;n++){c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0}
 let r=0xffffffff;for(const b of buf)r=t[(r^b)&255]^(r>>>8);return (r^0xffffffff)>>>0}
function chunk(type,data){const l=Buffer.alloc(4);l.writeUInt32BE(data.length);const td=Buffer.concat([Buffer.from(type),data]);
 const c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c])}
function png(size){
  const raw=Buffer.alloc((size*4+1)*size), cx=size/2, w=size*0.085;
  const rings=[[size*0.34,[250,17,79],0.8],[size*0.34-w*1.15,[146,232,42],0.65],[size*0.34-w*2.3,[30,234,239],0.9]];
  for(let y=0;y<size;y++){raw[y*(size*4+1)]=0;
    for(let x=0;x<size;x++){
      const dx=x-cx+.5, dy=y-cx+.5, d=Math.hypot(dx,dy);
      let a=(Math.atan2(dx,-dy)/(2*Math.PI)+1)%1, col=[0,0,0];
      for(const [r,c,frac] of rings) if(Math.abs(d-r)<w/2) col = a<=frac ? c : c.map(v=>Math.round(v*0.25));
      const o=y*(size*4+1)+1+x*4;raw[o]=col[0];raw[o+1]=col[1];raw[o+2]=col[2];raw[o+3]=255}}
  const ih=Buffer.alloc(13);ih.writeUInt32BE(size,0);ih.writeUInt32BE(size,4);ih[8]=8;ih[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
for(const s of [180,192,512]) fs.writeFileSync(`public/icon-${s}.png`,png(s));
