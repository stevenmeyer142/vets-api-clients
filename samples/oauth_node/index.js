require('dotenv').config();
const axios = require('axios');
const express = require('express');
const session = require('express-session');
//const { Issuer, Strategy } = require('openid-client');
const passport = require('passport');
const OAuth2Strategy = require('passport-oauth2');
const https = require('https');
const sqlite3 = require('sqlite3').verbose();
const env = process.env.ENVIRONMENT;
//const ROOT_URL = `https://${env}-api.va.gov/oauth2/.well-known/openid-configuration`;
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
var bodyParser = require('body-parser');
const { log } = require('console');
const redirect_uri = 'http://localhost:8081/auth/cb';
const authenticationURL = `https://${env}-api.va.gov/oauth2/claims/v1/authorization`;
const requestTokenURL = `https://${env}-api.va.gov/oauth2/claims/v1/token`;
const accessTokenURL = `https://${env}-api.va.gov/oauth2/claims/v1/token`;
const nonce = "14343103be036d10b974c40b6eb7c6553f0b91c0f766f1e3f7358d76c377bb8d";
const scope="profile openid offline_access claim.read claim.write";
// const scope = "profile openid offline_access launch/patient patient/AllergyIntolerance.read patient/Appointment.read patient/Binary.read patient/Condition.read patient/Device.read patient/DeviceRequest.read patient/DiagnosticReport.read patient/DocumentReference.read patient/Encounter.read patient/Immunization.read patient/Location.read patient/Medication.read patient/MedicationOrder.read patient/MedicationRequest.read patient/MedicationStatement.read patient/Observation.read patient/Organization.read patient/Patient.read patient/Practitioner.read patient/PractitionerRole.read patient/Procedure.read";

// const createClient = async () => {
//   Issuer.defaultHttpOptions = { timeout: 2500 };
//   return Issuer.discover(ROOT_URL).then(issuer => {
//     return new issuer.Client({
//       client_id,
//       client_secret,
//       redirect_uris: [
//         'http://localhost:8081/auth/cb'
//       ],
//     });
//   });
// }

const configurePassport = () => {
  passport.serializeUser((user, done) => {
    console.log('serializeUser', user);
    done(null, user);
  });

  passport.deserializeUser((user, done) => {
    console.log('deserializeUser', user);
    done(null, user);
  });

  passport.use("oauth2", new OAuth2Strategy({
    authorizationURL: authenticationURL,
    tokenURL: requestTokenURL,
    clientID: client_id,
    clientSecret: client_secret,
    scope: scope,
    state: true,
    callbackURL: redirect_uri

  },
  function(accessToken, refreshToken, profile, cb) {
    cb(null, { accessToken, refreshToken, profile });
  }
));
}

const userDetails = async (req, res, next) => {
  if (loggedIn) {
    res.send(req.session.user);
    next();
  } else {
    res.redirect('/auth'); // Redirect the user to login if they are not
    next();
  }
}

const verifyVeteranStatus = async (req, res, next) => {
  if (loggedIn(req)) {
    const access_token = req.session.user.accessToken;
    const has_token = access_token !== undefined;
    const veteranStatus = await new Promise((resolve, reject) => {
      https.get(
        `https://${env}-api.va.gov/services/veteran_verification/v2/status`,
        { headers: {'Authorization': `Bearer ${access_token}`} },
        (res) => {
          let rawData = '';
          if (res.statusCode !== 200) {
            reject(new Error('Request Failed'));
          }
          res.setEncoding('utf-8');
          res.on('data', (chunk) => { rawData += chunk; });
          res.on('end', () => {
            try {
              const parsedOutput = JSON.parse(rawData);
              resolve(parsedOutput.data.attributes.veteran_status);
            } catch (err) {
              reject(err);
            }
          });
        }
      ).on('error', reject);
    });
    res.render('status', { has_token: has_token, veteranStatus: veteranStatus, user: req.session.user });
    next();
  } else {
    res.redirect('/auth'); // Redirect the user to login if they are not
    next();
  }
};


const wrapAuth = async (req, res, next) => {
  
  //Passport or OIDC don't seem to set 'err' if our Auth Server sets them in the URL as params so we need to do this to catch that instead of relying on callback
  if (req.query.error) {
    return next(req.query.error_description);
  }
  
  //console.log('wrapAuth response ', req.query);
  const code = req.query.code;
  
  passport.authenticate('oauth2', function(err, user, info, status) {
    if (err) { return next(err) }
    if (!user) { return res.redirect('/auth') }
    req.session.user = user;
    res.redirect('/home');
  })(req, res, next);



  
// passport.authenticate("oidc", { successRedirect: "/home", failureRedirect: "/"})(req, res, next);
//  const data = new URLSearchParams();
// data.append('grant_type', 'authorization_code');
// data.append('code', code);
// data.append('redirect_uri', redirect_uri);
// const url = `https://${env}-api.va.gov/oauth2/claims/v1/token`;
// const authorization = 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64');
// const request = new Request(url, {
//   method: 'POST',
//   headers: {
//     'Content-Type': 'application/x-www-form-urlencoded',
//     'Authorization': authorization
//   },
//   body: data
// });


// console.log('\nRequest url', request.url, "\n ");
// console.log('\nRequest method', request.method.toString(), "\n ");
// for (var pair of request.headers.entries()) {
//   console.log(pair[0] + ', ' + pair[1]);
// }
// console.log('\nRequest body', data.toString(), "\n ");


// console.log('\nRequest ', request, "\n ");
// fetch(request)
// 	.then(response => response.json())
// 	.then(data => console.log(data))
// 	.catch(error => console.error(error));

};

const loggedIn = (req) => {
  console.log('req.session', req.session);
  console.log('req.session.user', req.session.user);

   return req.session && req.session.user;
}

const startApp = () => {
  const app = express();
  const port = 8081;
  const secret = 'My Super Secret Secret'
  let db = new sqlite3.Database('./db/lighthouse.sqlite', (err) => {
    if (err) {
      return console.error(err.message);
    }
    console.log('Connected to SQlite database.');
  });

  app.set('view engine', 'ejs')
  app.use(require('express-session')({ secret: 'keyboard cat', resave: true, saveUninitialized: true }));
  app.use(passport.initialize());
  app.use(passport.session());
  app.use(session({ secret, cookie: { maxAge: 60000 }, resave: true, saveUninitialized: true }));
  app.use(bodyParser.json()); // support json encoded bodies
  app.use(bodyParser.urlencoded({ extended: true }));

  app.get('/', (req, res) => {
    const has_token = req.session.user?.accessToken !== undefined;
    
    const url = `https://${env}-api.va.gov/oauth2/claims/v1/authorization?client_id=${client_id}&nonce=${nonce}&redirect_uri=${redirect_uri}&response_type=code&scope=${scope}&state=1589217940`;
  
    //console.log("\nAuthorization url ", url, "\n");
    if (loggedIn(req)) {
       res.render('index', { has_token: has_token, autherizeLink : url } )
    } else {
      res.render('index', { has_token: has_token, autherizeLink : url   } )
    }
  });

  app.get('/status', verifyVeteranStatus);
  app.get('/userdetails', userDetails);
  app.get('/coming_soon', (req, res) => {
    res.render('coming_soon', { has_token: {},} )
  })

  app.get('/home', (req, res) => {
    console.log('home req.session.user', req.session.user);
    if (loggedIn(req)) {
      const users = [];
      const sql = `SELECT id, first_name, last_name, social_security_number, birth_date FROM veterans`;
      const has_token = req.session.user?.accessToken !== undefined;
      db.all(sql, [], (err, rows) => {
        if (err) {
          throw err;
        }
        rows.forEach((row) => {
          users.push(row)
        });
        res.render('home', { has_token, users });
      });

    } else {
      res.redirect('/auth'); // Redirect the user to login if they are not
    }
  });

  app.get('/claims', (req, res) => {
    if (loggedIn(req)) {
      const access_token = req.session.user.accessToken;
      const has_token = access_token !== undefined;
      axios.get(`https://${env}-api.va.gov/services/claims/v1/claims`, {
        headers: {
          Authorization: `Bearer ${access_token}`
        }
      })
      .then(response => {
        res.render('claims', { claims: response.data.data, has_token: has_token });
      })
      .catch(error => {
        console.log(error)
      })
    } else {
      res.redirect('/auth'); // Redirect the user to login if they are not
    }
  });

  app.get('/claims/for/:id', (req, res) => {
    if (loggedIn(req)) {
      const id = req.params.id;
      const users = [];
      const sql = `SELECT id, first_name, last_name, social_security_number, birth_date FROM veterans where id = ?`;
      const access_token = req.session.user.accessToken;
      const has_token = access_token !== undefined;
      db.get(sql, [id], (err, row) => {
        if (err) {
          throw err;
        }
        axios.get(`https://${env}-api.va.gov/services/claims/v1/claims`, {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'X-VA-First-Name': row.first_name,
            'X-VA-Last-Name': row.last_name,
            'X-VA-Birth-Date': row.birth_date,
            'X-VA-SSN': row.social_security_number
          }
        })
        .then(response => {
          res.render('claims', { user: `${row.first_name} ${row.last_name}`, claims: response.data.data, has_token: has_token });
        })
        .catch(error => {
          console.log(error)
          console.log('Iam error')
        })
      });

    } else {
      res.redirect('/auth'); // Redirect the user to login if they are not
    }
  });

  app.post('/users', (req, res) => {
    const first_name = req.body.first_name;
    const last_name = req.body.last_name;
    const social_security_number = req.body.ssn;
    const birth_date = req.body.birth_date;
    console.log(first_name);
    console.log(last_name);
    console.log(social_security_number);
    console.log(birth_date);
    db.run('INSERT INTO veterans(first_name, last_name, social_security_number, birth_date) VALUES(?, ?, ?, ?)', [first_name, last_name, social_security_number, birth_date], (err) => {
      if(err) {
        return console.log(err.message);
      }

      res.redirect('/home');
    })
  });

  app.get('/auth', passport.authenticate("oauth2"));
  app.get('/auth/cb', wrapAuth);

  app.listen(port, () => console.log(`Example app listening on port ${port}!`));
}

(async () => {
  try {
    configurePassport();
    startApp();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
