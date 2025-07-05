module.exports = {
    testEnvironment: 'node',
    coverageDirectory: 'coverage',
    collectCoverageFrom: [
        'lib/**/*.js',
        '!lib/algoProperties.js' // Skip algorithm definitions
    ],
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js'
    ],
    coverageThreshold: {
        global: {
            branches: 80,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },
    testTimeout: 10000,
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/lib/$1'
    }
};