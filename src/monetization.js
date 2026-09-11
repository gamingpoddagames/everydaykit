const cfg=window.EK_MONETIZATION||{};
function loadAds(){if(!cfg.adsenseClient)return;const s=document.createElement('script');s.async=true;s.src=`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(cfg.adsenseClient)}`;s.crossOrigin='anonymous';document.head.appendChild(s);}
function addAdSlots(){if(!cfg.adsenseClient)return;document.querySelectorAll('.ek-ad-slot').forEach(el=>{el.innerHTML=`<ins class="adsbygoogle" style="display:block" data-ad-client="${cfg.adsenseClient}" data-ad-slot="${el.dataset.slot||''}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;try{(window.adsbygoogle=window.adsbygoogle||[]).push({})}catch(e){}})}
function init(){loadAds();if(cfg.adsenseClient)setTimeout(addAdSlots,800)}
init();
