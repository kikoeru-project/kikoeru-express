echo "" >> "D:\Program Files (x86)\kikoeru\kiko.log"
echo "" >> "D:\Program Files (x86)\kikoeru\kiko.log"
echo "kiko start" >> "D:\Program Files (x86)\kikoeru\kiko.log"
date /T >> "D:\Program Files (x86)\kikoeru\kiko.log"
time /T >> "D:\Program Files (x86)\kikoeru\kiko.log"
D:
cd "D:\Program Files (x86)\kikoeru"
npm start >> "D:\Program Files (x86)\kikoeru\kiko.log" 2>&1
echo "kiko stop" >> "D:\Program Files (x86)\kikoeru\kiko.log"