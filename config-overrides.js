module.exports = function override(config) {
  // Add the fallbacks for node core modules
  config.resolve = {
    ...config.resolve,
    fallback: {
      querystring: require.resolve('querystring-es3'),
      https: require.resolve('https-browserify'),
      os: require.resolve('os-browserify/browser'),
      http: false,
      stream: false,
      crypto: false,
      buffer: false,
      url: false,
      assert: false,
      util: false
    }
  };
  return config;
}; 