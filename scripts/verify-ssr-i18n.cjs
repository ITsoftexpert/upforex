require('./verify-native-release.cjs').verifyRelease('ssr-i18n').catch(error => { console.error(error); process.exitCode=1; });
