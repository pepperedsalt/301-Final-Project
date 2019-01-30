'use strict';

const express = require('express');
const superagent = require('superagent');
const pg =require('pg');
const methodOverride = require('method-override');

require('dotenv').config();
const PORT = process.env.PORT || 3000;
const client = new pg.Client(process.env.DATABASE_URL);
client.connect();
client.on('err', err=>console.log(err));

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('./public'));
app.use(express.urlencoded({extended: true}));

app.listen(PORT, ()=> console.log(`Listening on port ${PORT}`));

app.use(
  methodOverride(request => {
    if(request.body && typeof request.body === 'object' && '_method' in request.body) {
      let method = request.body._method;
      delete request.body._method;
      return method;
    }
  })
);
app.get('/', loadLogin);
app.post('/check-password', checkPassword);
app.post('/create-login', addAccount);
app.post('/location', requestLocation);
app.get('/location', requestLocation);
app.post('/events', createEvent);

app.get('/eventData', getEvents);

let uID = 0;
//error handler
function errorHandler(err, response){
  console.error(err);
  if(response) response.status(500).send('Something Broke!!!')
}


//------------------ Login Functions --------------------------------//

function loadLogin (request, response) {
  response.render('./index', {formaction: 'get'});
}


//Once the user attempts to login, go here.
function checkPassword (request, response){
  let SQL = `SELECT * FROM users WHERE username=$1 AND password=$2;`;
  let values = [request.body.username, request.body.password];

  client.query(SQL, values)
    .then(result => {
      //check the database for the username password combo.
      if(result.rows.length > 0){
        uID = result.rows[0].id;
        //If the user exists, go to lookupLocation then check for a location in the database
        Location.lookupLocation(result.rows[0].id, response);
      }
      else{
        console.log('here in else')
        response.redirect('/')
      }
    })
    .catch( () => {
      console.log('here in catch')
      response.render('./index')
    });
}


function addAccount(request, response) {
  let SQL = `SELECT * FROM users WHERE username=$1;`;
  let values = [request.body.username];

  client.query(SQL, values)
    .then(result => {
      console.log(result.rows)
      if(result.rows.length > 0){
        console.log('username exists')
        response.redirect('/');
      } else{
        let {username, password} = request.body;
        let SQL = `INSERT INTO users(username, password) VALUES ($1, $2);`;
        let values = [username, password];
        return client.query(SQL, values)
          .then(response.redirect('/'))
      }
    })
}

//------------------ Location Functions --------------------------------//

Location.lookupLocation = (id, response)=>{
  const SQL = `SELECT * FROM locations WHERE user_id=$1;`;
  const values = [id];
  client.query(SQL, values)
    .then(results=>{
      //check the database for any data for that specific user.
      if(results.rows.length > 0){
        //if there is a value in the database at that user_id, get the location.
        getLocation(results.rows[0].user_id, response);
      }
      else{
        //if there is no location data, then render the page for the user to enter a location.
        response.render('pages/location_page');
      }
    })
    .catch(error => errorHandler(error));
};

function requestLocation(request, response){
  Location.fetchLocation(request.body.search)
    .then(data=>{
      response.render('pages/dashboard', {location: data});
    });
}

 function getLocation(id, response){
   //search the database and return a value for that user_id.
   let SQL =`SELECT * FROM locations WHERE user_id=$1;`;
   let values = [id];
   client.query(SQL, values)
   .then(result => {
     console.log('line 128', result.rows);
     //once you recieve the data, render the dashboard page with the results(the location data) passed through. Instead of passing htrough the results, it could then call a function to work on the next api (weather?)
     response.render('pages/dashboard', {location: result.rows[0]})
   })
 }


 //When the button on the location page is submitted, go here. Ping the api.
Location.fetchLocation = (query)=>{
  const geoData = `https://maps.googleapis.com/maps/api/geocode/json?address=${query}&key=${process.env.GEOCODE_API_KEY}`;
  return superagent.get(geoData)
    .then(response=>{
      if(!response.body.results.length){
        throw 'no data';
      }
      else{
        let location = new Location(query, response.body.results[0])
        //once it get the data from the api, go to the save function. That is where it checks for existing data, then replaces it if need be.
        return location.save()
          .then(() =>{
            return location;
          })
      }
    })
    .catch(error => errorHandler(error));
}

function Location(query, response){
  this.formatted_query = response.formatted_address;
  this.latitude = response.geometry.location.lat;
  this.longitude = response.geometry.location.lng;
  this.search_query = query;
  this.user_id = uID;
}

Location.prototype.save = function(){
  console.log('line 162');
  let SQL = `SELECT * FROM locations WHERE user_id=$1;`;
  let values = [uID];
  return client.query(SQL, values)
    .then(results => {
      console.log('line 167' ,results);
      if(results.rows.length > 0){
        console.log('line 165, location data already exists');
        let SQL = `DELETE FROM locations WHERE user_id=$1;`;
        let values =[uID];
        return client.query(SQL, values);
      }})
      .then(()=>{
        let SQL = `INSERT INTO locations (formatted_query, latitude, longitude, search_query, user_id) VALUES ($1, $2, $3, $4, $5);`;
        let values =[this.formatted_query, this.latitude, this.longitude, this.search_query, this.user_id];
        return client.query(SQL, values);
      })
}

function createEvent(request, response) {
  let {date, start_time, title, description} = request.body;
  let SQL = `INSERT INTO events (date, start_time, title, description, user_id) VALUES ($1, $2, $3, $4, $5);`;
  let values = [date, start_time, title, description, 1];

  return client.query(SQL, values)
    .then( data =>{
      getEvents(data, response);
    })
    .catch(error => errorHandler(error));
}

function getEvents(request, response) {
  let SQL = `SELECT * FROM events WHERE user_id=$1;`;
  let values = [1];

  return client.query(SQL, values)
    .then(result=> {
      if(result.rows.length > 0) {
        response.render('pages/events_page', {events: result.rows});
      } else {
        response.render('pages/events_page', {events: ''});
      }
    })
    .catch(error => errorHandler(error));
}
