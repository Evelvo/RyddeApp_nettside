const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const session = require('express-session');
const bodyParser = require('body-parser');
const multer = require('multer');
const sharp = require('sharp');

const storage = multer.memoryStorage({
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed.'));
        }
    }
});

const upload = multer({
    storage: storage,
});

const app = express();
const port = process.env.PORT || 3000;

const db = new sqlite3.Database('data.db');

app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
    secret: 'makaroni_er_godt82u2u3852739853f89y78',
    resave: false,
    saveUninitialized: true
}));
app.use(bodyParser.urlencoded({ extended: true }));
app.set('views', path.join(__dirname, 'public', 'templates'));
app.set('view engine', 'html');
app.engine('html', require('ejs').renderFile);



app.post('/addtask', isAuthenticated, upload.single('image'), async (req, res) => {
    const { title, description, price } = req.body;

    let imageData = req.file.buffer;

    let resizedImageBuffer = await sharp(req.file.buffer)
        .resize({ fit: 'inside', width: 600, height: 300 })
        .jpeg({ quality: 70 })
        .toBuffer();

    while (resizedImageBuffer.length > 600000) {
        imageData = await sharp(resizedImageBuffer)
            .jpeg({ quality: 60 })
            .toBuffer();
        
        resizedImageBuffer = await sharp(imageData)
            .resize({ fit: 'inside', width: 600, height: 300 })
            .toBuffer();
    }

    const currentUser = req.session.user;
    const image = resizedImageBuffer.toString('base64');

    db.run('INSERT INTO Tasks (username, title, image, description, price) VALUES (?, ?, ?, ?, ?)', 
           [currentUser, title, image, description, price], (err) => {
        if (err) {
            console.error(err);
            res.status(500).send(`Error adding task: ${err.message}`);
        } else {
            res.redirect('/addtask');
        }
    });
});





function generateRandomCode() {
    return Math.floor(Math.random() * (1000000 - 100000) + 100000);
}


app.post('/register', (req, res) => {
    const { username, password } = req.body;
    const familyCode = generateRandomCode();

    db.get('SELECT * FROM Users WHERE username = ?', [username], (err, row) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error registering user');
        } else if (row) {
            res.status(400).send('Username already exists');
        } else {
            db.run('INSERT INTO Users (username, password, family_code) VALUES (?, ?, ?)', [username, password, familyCode], (err) => {
                if (err) {
                    console.error(err);
                    res.status(500).send('Error registering user');
                } else {
                    res.redirect('/login');
                }
            });
        }
    });
});


app.post('/login', (req, res) => {
    const { username, password } = req.body;
    db.get('SELECT * FROM Users WHERE username = ? AND password = ?', [username, password], (err, row) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error logging in');
        } else if (!row) {
            res.status(401).send('Invalid username or password');
        } else {
            req.session.user = username;
            res.redirect('/dashboard');
        }
    });
});

function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/login');
    }
}

app.get('/dashboard', isAuthenticated, (req, res) => {
    const currentUser = req.session.user;

    db.get('SELECT family_code FROM Users WHERE username = ?', [currentUser], (err, row) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error retrieving family code');
        } else {
            const familyCode = row ? row.family_code : null;

            db.all('SELECT username, title, image, description, price FROM Tasks WHERE username IN (SELECT username FROM Users WHERE family_code = ?)', [familyCode], (err, rows) => {
                if (err) {
                    console.error(err);
                    res.status(500).send('Error retrieving tasks');
                } else {
                    res.render('dashboard.html', { username: currentUser, familyCode: familyCode, tasks: rows });
                }
            });
        }
    });
});


app.get('/family', isAuthenticated, (req, res) => {
    const currentUser = req.session.user;
    
    db.get('SELECT family_code FROM Users WHERE username = ?', [currentUser], (err, row) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error retrieving family code');
        } else {
            const familyCode = row ? row.family_code : null;
            
            db.all('SELECT username FROM Users WHERE family_code = ?', [familyCode], (err, rows) => {
                if (err) {
                    console.error(err);
                    res.status(500).send('Error retrieving family members');
                } else {
                    const familyMembers = rows.map(row => row.username);
                    res.render('family.html', { username: currentUser, familyCode: familyCode, familyMembers: familyMembers });
                }
            });
        }
    });
});

app.post('/changeFamilyCode', (req, res) => {
    const { familyCode } = req.body;
    const currentUser = req.session.user;

    db.run('UPDATE Users SET family_code = ? WHERE username = ?', [familyCode, currentUser], (err) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error updating family code');
        } else {
            res.redirect('/family');
        }
    });
});

app.get('/login', (req, res) => {
    res.render('login.html');
});

app.get('/register', (req, res) => {
    res.render('register.html');
});

app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error(err);
            res.status(500).send('Error logging out');
        } else {
            res.redirect('/login');
        }
    });
});

app.get('/addtask', isAuthenticated, (req, res) => {
    const currentUser = req.session.user;
    res.render('addtask.html', { username: currentUser });
});


app.get('/ikke_ferdig', isAuthenticated, (req, res) => {
    res.render('ikke_ferdig.html');
});

app.get('/', (req, res) => {
    res.render('index.html');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
