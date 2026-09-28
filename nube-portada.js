/* Entrada una vez y flotación solo mientras la portada está visible. */
(() => {
 const cloud=document.querySelector('.bn-age-cloud');
 const hero=cloud?.closest('.hero');
 if(!cloud||!hero||cloud.dataset.cloudReady)return;
 cloud.dataset.cloudReady='true';
 let visible=false,started=false;
 const update=()=>cloud.classList.toggle('bn-cloud-outside',!visible||document.hidden);
 const enter=()=>{
  if(!started){started=true;cloud.classList.add('bn-cloud-ready');}
  update();
 };
 if('IntersectionObserver' in window){
  new IntersectionObserver(entries=>{
   visible=entries[0].isIntersecting;
   if(visible)enter();else update();
  },{threshold:0}).observe(cloud);
 }else{visible=true;enter();}
 document.addEventListener('visibilitychange',update);
})();
