# Workout4Charity-ChatBot

## Installation
run in Terminal
    
    npm install
    
create file in Project `/.env`, containing your Environment Variables:

    MESSENGER_APP_SECRET = 
    MESSENGER_VALIDATION_TOKEN = 
    MESSENGER_PAGE_ACCESS_TOKEN = 
    SERVER_URL = http://localhost:5000/
    
    ADDRESSES = 
    API_AI_ACCESS_TOKEN = 
    DASHBOT_API_KEY = 
    
    DB_USER = 
    DB_PASSWORD = 
    DB_SERVER = 
    DB_DATABASE = 
    
    DEV_DB_DATABASE = 
    DEV_DB_USER = 

## Start PostgreSQL on Arch
run in Terminal

    sudo systemctl start postgresql

## Run Locally
run in Terminal

    npm run start
    
## Migrate Database to Production Server

    npm run migrate