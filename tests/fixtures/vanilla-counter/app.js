let count = 0;
const display = document.getElementById('count');

document.getElementById('increment').addEventListener('click', () => {
  count++;
  display.textContent = count;
});

document.getElementById('decrement').addEventListener('click', () => {
  count--;
  display.textContent = count;
});
