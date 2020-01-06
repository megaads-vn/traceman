module.exports = {
    port: 3008,
    debug: true,
    requestTimeout: -1,
    autoload: [
        "/controllers",
        "/entities",
        "/start",
        "/workers"
    ],
    assetPath: "/assets",
    encryption: {
        'key': "d6F3Efeq",
        'cipher': "aes-256-ctr"
    },
    sslMode: {
        enable: false,
        port: 2308,
        options: {
            key: "/path/file.key",
            cert: "/path/file.crt"
        }
    }
};
