module.exports = [
  {
    test: /\.tsx?$/,
    exclude: /node_modules/,
    use: {
      loader: 'babel-loader',
      options: {
        presets: ['@babel/preset-typescript'],
      },
    },
  },
  {
    test: /\.css$/,
    use: ['style-loader', 'css-loader'],
  },
  {
    test: /\.(task|wasm|png|ico|svg)$/,
    type: 'asset/resource',
  },
];
