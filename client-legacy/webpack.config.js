var config = {
  entry: __dirname + '/src/app.js',
  output: {
    path: __dirname + '/build',
    filename: 'bundle.js'
  },
  devtool: "source-map",
  resolve: {
    extensions: ['.js', '.jsx']
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: {
          presets: ['react']
        }
      },
      {
        test: /\.scss$/,
        use:[{
          loader: "style-loader"
        },
        {
          loader: "css-loader"
        },
        {
          loader: "sass-loader",
          options: {
            implementation: require("sass")
          }
        }]
      }
    ]
  }
};

module.exports = config;
