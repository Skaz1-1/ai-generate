import fs from 'fs';

async function main() {
  const res = await fetch('http://localhost:3000/api/generate-game', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: 'Создай 3D-лабиринт' })
  });
  const data = await res.json();
  if (data.html) {
    fs.writeFileSync('./3d_generated.html', data.html);
    console.log('Saved ./3d_generated.html successfully, size:', data.html.length);
  } else {
    console.log('Error:', data.error);
  }
}
main().catch(console.error);
