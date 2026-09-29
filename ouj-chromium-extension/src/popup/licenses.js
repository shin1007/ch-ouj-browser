document.addEventListener('DOMContentLoaded', async () => {
  const licenseFiles = [
    {
      name: t('licenses.thisExtension'),
      path: 'popup/licenses/LICENSE_this_extension.txt'
    }
    // 他のライブラリがあればここに追加
  ];

  const container = document.getElementById('licenses-container');

  for (const file of licenseFiles) {
    try {
      const response = await fetch(chrome.runtime.getURL(file.path));
      const text = await response.text();

      const title = document.createElement('h2');
      title.textContent = file.name;
      const pre = document.createElement('pre');
      pre.textContent = text;

      container.appendChild(title);
      container.appendChild(pre);
    } catch (error) {
      console.error(`Failed to load license for ${file.name}:`, error);
    }
  }
});