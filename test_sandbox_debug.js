import http from 'http';
import fs from 'fs';

const html1 = fs.existsSync('./3d_generated.html') ? fs.readFileSync('./3d_generated.html', 'utf-8') : '';
const html2 = fs.existsSync('./src/test_3d_generated.html') ? fs.readFileSync('./src/test_3d_generated.html', 'utf-8') : '';

console.log('3d_generated.html size:', html1.length);
console.log('src/test_3d_generated.html size:', html2.length);

// Check potential crashers:
function checkRisks(name, html) {
  console.log(`\n--- Checking ${name} ---`);
  console.log('THREE references:', (html.match(/THREE\b/g) || []).length);
  console.log('localStorage:', (html.match(/localStorage/g) || []).length);
  console.log('sessionStorage:', (html.match(/sessionStorage/g) || []).length);
  console.log('requestPointerLock:', (html.match(/requestPointerLock/g) || []).length);
  console.log('pointerLockElement:', (html.match(/pointerLockElement/g) || []).length);
  console.log('window.parent:', (html.match(/window\.parent/g) || []).length);
  console.log('window.top:', (html.match(/window\.top/g) || []).length);
  console.log('alert/confirm/prompt:', (html.match(/\b(alert|confirm|prompt)\s*\(/g) || []).length);
  console.log('start button matches:', html.match(/id=["'](start-btn|btn-start|play-btn|start)[\w-]*["']/gi));
  console.log('start button text matches:', html.match(/>\s*(Запустить[^<]*|Играть[^<]*|Старт[^<]*)</gi));
}

checkRisks('3d_generated.html', html1);
checkRisks('src/test_3d_generated.html', html2);
