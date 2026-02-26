const { Sequelize } = require( 'sequelize');
require( 'dotenv' ).config();
const sequelize = new Sequelize({
host: 'localhost' ,
port: 5432,
database: 'adsync_pro' ,
username: 'postgres' ,
password: 'Khwezi34',
dialect: 'postgres' ,
logging: false
}) ;
const testConnection = async () => {
try {
    await sequelize.authenticate();
    console.log( '[OK] Database connection works! ' );
    return true;
} catch (error) {
    console.error( '[FAIL] Database error:' ,error.message) ;
    return false;
}
};
module.exports = { sequelize, testConnection };    