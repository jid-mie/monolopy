
#!/bin/sh
echo "installing root npm modules..."
npm install

echo "installing server npm modules..."
npm install --prefix server

echo "installing client npm modules..."
npm install --prefix client

echo "starting dev servers..."
npm run dev
