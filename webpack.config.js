const path = require('path');
const { UserscriptPlugin } = require('webpack-userscript');

const dev = process.env.NODE_ENV === 'development';

const userscriptHeaders = {
  name: "Discord Message Encryption",
  description: "Encrypts messages before sending, decrypts received messages",
  version: "0.1",
  author: "Daniel Farushev",
  match: "https://discord.com/*",
  grant: "none",
}

module.exports = {
  mode: dev ? 'development' : 'production',
  devtool: dev ? 'inline-source-map' : false,
  devServer: {
    static: './dist',
    client: {
      overlay: {errors: true, warnings: false, runtimeErrors: false},
    }
  },
  entry: './src/index.js',
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  plugins: [
    new UserscriptPlugin({
      headers: dev
        ? {
          ...userscriptHeaders,
          version: `${userscriptHeaders.version}-build.[buildTime]`,
        }
        : userscriptHeaders
    }),
  ],
};