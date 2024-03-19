const path = require('path');
const { UserscriptPlugin } = require('webpack-userscript');

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  plugins: [
    new UserscriptPlugin({
      headers: {
        name: "Discord Message Encryption",
        description: "Encrypts messages before sending, decrypts received messages",
        version: "0.1",
        author: "Daniel Farushev",
        match: "https://discord.com/*",
        grant: "none",
      }
    })
  ],
};