const { testConnection } = require('./config/database');
console.log('Testing database connection...');
testConnection().then(success => {
    if (success) {
        console.log('All good! Database is connected.');
    } else {
        console.log('Failed to connect. Check if PostgreSQL is running.');
    }
    process.exit(0);
});