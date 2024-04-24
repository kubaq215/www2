const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
require('dotenv').config();

// Create a new database file or open an existing one
const db = new sqlite3.Database('./tenders.db', sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
        console.error(err.message);
    }
    console.log('Connected to the SQLite database.');
});

// Set up the database table if it doesn't exist
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tenders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        description TEXT,
        institution_id INTEGER,
        start_datetime TEXT,
        end_datetime TEXT,
        maximum_budget REAL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS bids (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tender_id INTEGER,
        institution_id INTEGER,
        bid_amount REAL,
        timestamp TEXT
    )`);
});

const app = express();

// Set the view engine to ejs
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Define routes
app.get('/', (req, res) => {
    res.render('index', { title: 'Home Page' });
});

app.get('/tenders/past', (req, res) => {
    db.all('SELECT * FROM tenders WHERE end_datetime < datetime("now", "+2 hour")', [], (err, tenders) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error accessing database.");
        }
        res.render('past_tenders', { title: 'Past Tenders', tenders: tenders });
    });
});

app.get('/tenders', (req, res) => {
    const sql = 'SELECT * FROM tenders WHERE end_datetime > datetime("now", "+2 hour")';
    db.all(sql, [], (err, tenders) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error accessing database.");
        }
        res.render('tenders', { title: 'Current Tenders', tenders: tenders });
    });
});

app.get('/tender/add', (req, res) => {
    res.render('add_tender', { title: 'Add New Tender' });
});

app.get('/tender/:id', (req, res) => {
    const sqlTender = 'SELECT * FROM tenders WHERE id = ?';
    db.get(sqlTender, [req.params.id], (err, tender) => {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Error accessing database.");
        }
        if (!tender) {
            return res.status(404).send("Tender not found.");
        }

        // Check if the tender is active or past its end date
        const now = new Date();
        if (new Date(tender.end_datetime) > now) {
            // Tender is active, get the current highest bid
            const sqlHighestBid = 'SELECT MAX(bid_amount) AS highest_bid FROM bids WHERE tender_id = ?';
            db.get(sqlHighestBid, [tender.id], (err, bid) => {
                tender.highest_bid = bid ? bid.highest_bid : 'No bids yet';
                res.render('tender_details', { tender: tender });
            });
        } else {
            // Tender has ended, get the winning bid's institution ID
            const sqlWinningBid = `SELECT institution_id FROM bids WHERE tender_id = ? ORDER BY bid_amount DESC LIMIT 1`;
            db.get(sqlWinningBid, [tender.id], (err, bid) => {
                tender.winner_id = bid ? bid.institution_id : 'No winner';
                res.render('tender_details', { tender: tender });
            });
        }
    });
});

app.post('/tender/add', (req, res) => {
    const { name, description, institution, start_datetime, end_datetime, maximum_budget } = req.body;
    console.log(start_datetime + ":00", end_datetime);
    const sql = `INSERT INTO tenders (name, description, institution_id, start_datetime, end_datetime, maximum_budget)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    db.run(sql, [name, description, institution, start_datetime + ":00", end_datetime + ":00", maximum_budget], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Failed to add tender due to an error.");
        }
        res.redirect('/tenders');
    });
});

app.post('/tender/:id/bid', (req, res) => {
    const tender_id = req.params.id;
    const { institution_id, bid_amount } = req.body;
    const sql = 'INSERT INTO bids (tender_id, institution_id, bid_amount, timestamp) VALUES (?, ?, ?, datetime("now"))';
    db.run(sql, [tender_id, institution_id, bid_amount], function(err) {
        if (err) {
            console.error(err.message);
            return res.status(500).send("Failed to insert bid due to an error.");
        }
        res.redirect(`/tender/${tender_id}`);
    });
});


// Start the server
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';

app.listen(PORT, HOST, () => {
    console.log(`Server started on http://${HOST}:${PORT}`);
});
