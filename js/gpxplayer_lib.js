/* 
Copyright (c) 2009 Heikki Vesalainen. All rights reserved.


USAGE:

1. create a new Track object for each track to be played

var map = new google.maps.Map2(document.getElementById('map'));
// init and style the map here

var player = new sailingtracker.Player(map);

for (var gpxData in gpxDatas) {  
  var track = new sailingtracker.Track(gpxData);
  var marker = new google.maps.Marker(track.getCurrentLatLng());
  // style the marker
	
  track.setMarker(marker);
  player.addTrack(track);
  }

  player.start();
  player.setSpeed(10); // speed is 10 player seconds in 1 real second
  player.setSpeed(-1); // speed is -1 player seconds in 1 real second (i.e. reverse playback)
  player.stop()
  player.toStart();
  player.start();
  player.stop()
  player.jumpTo(60*15*1000); // jump 15 minutes from start
  player.getPlayerTime() // get the absolute time we are currently at
  player.getElapsedTime() // get the relative time (from start) we are currently at
  player.toEnd();
 
*/


/*
 * namespace
 */
var sailingtracker = sailingtracker ? sailingtracker : {};

sailingtracker.knotsperms = 1.94384449;
sailingtracker.earthR = 6371000; // metres

/**
 * Adapted from Chris Veness, http://www.movable-type.co.uk/scripts/latlong.html
 */
if (typeof(Number.prototype.toRad) === "undefined") {
  Number.prototype.toRad = function() {
    return this * Math.PI / 180;
  }
}

/** 
 * Adapted from Chris Veness, http://www.movable-type.co.uk/scripts/latlong.html
 */
if (typeof(Number.prototype.toDeg) === "undefined") {
  Number.prototype.toDeg = function() {
    return this * 180 / Math.PI;
  }
}

/** 
 * Adapted from Chris Veness, http://www.movable-type.co.uk/scripts/latlong.html
 */
sailingtracker.distanceAndBearing = function(latlon1, latlon2) {
  var lat1 = latlon1.lat.toRad(), lon1 = latlon1.lon.toRad(),
  lat2 = latlon2.lat.toRad(), lon2 = latlon2.lon.toRad();
  
  var dLon = lon2 - lon1;
  
  var a = Math.cos(lat2)*Math.cos(dLon);
  
  var distance = Math.acos(Math.sin(lat1)*Math.sin(lat2) + 
                           Math.cos(lat1)*a) * sailingtracker.earthR;

  distance %= sailingtracker.earthR; // always go the shortest way
  
  var y = Math.sin(dLon) * Math.cos(lat2);
  var x = Math.cos(lat1)*Math.sin(lat2) - Math.sin(lat1)*a;
  
  var bearing = (Math.atan2(y, x).toDeg() + 360) % 360;
  
  return [ distance, bearing ];
};

sailingtracker.shrink = function(bounds, ration) {
  var sw = bounds.getSouthWest();
  var ne = bounds.getNorthEast();

  var dlat = (ne.lat() - sw.lat()) * ration;
  var dlng = ((sw.lng() < ne.lng()) ? (ne.lng() - sw.lng()) : 
              (ne.lng() - sw.lng() + 360)) * ration;

  sw = new google.maps.LatLng(sw.lat() + dlat,
                              sw.lng() + dlng);
  ne = new google.maps.LatLng(ne.lat() - dlat,
                              ne.lng() - dlng);
  return new google.maps.LatLngBounds(sw, ne);
}


/** 
 * InfoArea extends google OverlayView
 */
sailingtracker.InfoArea = function(map) {
  if (this === window) { return; }

  google.maps.OverlayView.apply(this, arguments); // inherit OverlayView

  var latlng = null;
  var div = null;

  this.onAdd = function() {
    div = document.createElement("div");
    div.className = "infoArea";
    div.innerHTML = "";
    div.style.position = "absolute";
    div.style.display = "none";

    this.getPanes().floatPane.appendChild(div);
  }

  function setPosition(aLatlng) {
    latlng = aLatlng

    if (div && this.getProjection) {
      if (latlng !== null) {
        var p = this.getProjection().fromLatLngToDivPixel(latlng);
        
        div.style.display = "block";
        div.style.left = p.x + "px";
        div.style.top = p.y + "px";
      } else {
        div.style.display = "none";
      }
    }
  }

  function setSpeedAndBearing(aSpeed, aBearing) {
    if (div) {
      if (aSpeed !== null && (!isNaN(aSpeed))) {
        div.innerHTML = (aSpeed * sailingtracker.knotsperms).toFixed(1) + 
        "<br />" + aBearing.toFixed(0) + "&#176;";
      } else {
        div.innerHTML = "";
      }
    }
  }

  this.setPosition = setPosition;
  this.setSpeedAndBearing = setSpeedAndBearing;
  this.remove = function() { setPosition(null); }
  this.draw = function(force) { setPosition(latlng);}
  this.hide = function() { setPosition(null); }
};

sailingtracker.SpeedGraph = function(canvas) {
  var self = this;
    var context = null;
    var tracks = [];
    var tmin, tmax, smax = -1;
    var lastPlayerTime;
    var timeWindow = 1000*60*4; // default is 4 minutes

    // canvas.clientWidth, canvas.clientHeight

    if (canvas.getContext) {
      context = canvas.getContext("2d");
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }

    function addTrack(track, color) {
      if (context && track.hasTrackPoints()) {
        tracks.push({track:track, 
                     trackIterator:track.getTrackDataIterator(), 
                     color:color});
      }
    }

    function removeTrack(aTrack) {
      if (context) {
        var i;
        for (i = 0; i < tracks.length; i++) {
          if (tracks[i].track === aTrack) {
            tracks.splice(i, 1);
          }
        }
        update(lastPlayerTime);
      }
    }

    function x(time) {
      return ((time - tmin) / (tmax - tmin)) * canvas.clientWidth;
    }

    function y(speed) {
      return (1 - (speed / smax)) * canvas.clientHeight;
    }


    function moveTo(time, speed) {
      if (speed) {
        context.moveTo(x(time), y(speed));
      } else {
        context.moveTo(x(time), y(0));
      }
    }

    function lineTo(time, speed) {
      if (speed) {
        context.lineTo(x(time), y(speed));
        //        context.stroke();
      }
    }

    function drawScale() {
      var steps = (smax * sailingtracker.knotsperms).toFixed();
      var stepHeight = canvas.clientHeight / steps;
      var stepSpeed, speed;

      if (smax < 0) {
        // smax not initialized, cannot draw
        return;
      }

      while (stepHeight > 30) {
        steps *= 2;
        stepHeight /= 2;
      }

      while (stepHeight < 15) {
        steps /= 2;
        stepHeight *= 2;
      }

      speed = stepSpeed = ((smax * sailingtracker.knotsperms).toFixed() / 
                           steps) / sailingtracker.knotsperms;
	
      context.save();
      context.strokeStyle = "rgba(220, 220, 220, 1)";
      context.beginPath();
      while (steps-- > 0) {
        moveTo(tmin, speed);
        lineTo(tmax, speed);
        speed += stepSpeed;
      }
      context.stroke();
      context.restore();
	
    }

    /**
     * Draw the track speed graph
     * @returns max speed
     */
    function draw(playerTime, trackIterator, color) {
      var maxSpeed = 0;

      var p = trackIterator.getPoint(tmin);
      trackIterator.mark();

      var isFirst = false;

      if (p == null) {
        if (trackIterator.hasNext()) {
          p = trackIterator.getNextPoint();
        } else {
          return;
        }
      }

      //sailingtracker.knotsperms 
      context.save();
      context.strokeStyle = color;
      context.beginPath();
      if (smax > 0) {
        moveTo(p.time, p.speed);
      }

      while (trackIterator.hasNext()) {
        p = trackIterator.getNextPoint();

        if (smax > 0) {
          if (isFirst) {
            moveTo(p.time, p.speed);
          } else {
            lineTo(p.time, p.speed);
          }
        }

        if (p.speed > maxSpeed) {
          maxSpeed = p.speed;
        }

        if (p.time > tmax) {
          break;
        }
	    
        // if this is last, then next (if any) is first
        isFirst = trackIterator.isLastPoint();
      }

      context.stroke();
      context.restore();

      trackIterator.reset();
      lastPlayerTime = playerTime;

      return maxSpeed;
    }

    function update(playerTime) {
      var i, s, track;
      var maxSpeed = 1 / sailingtracker.knotsperms;

      if (!context) { return; }

      tmin = playerTime - (timeWindow/2);
      tmax = playerTime + (timeWindow/2);

      context.save();
      // clear context
      context.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);

      drawScale();

      // draw playerTime marker (only if smax is initialized)
      if (smax > 0) {
        context.strokeStyle = "rgba(0, 0, 0, 1)";
        context.beginPath();
        moveTo(playerTime, 0);
        lineTo(playerTime, smax);
        context.stroke();
        context.restore();
      }

      for (i = 0; i < tracks.length; i++) {
        s = draw(playerTime, tracks[i].trackIterator, tracks[i].color);
        if (s > maxSpeed) {
          maxSpeed = s;
        }
      }

      maxSpeed *= 1.5;

      if (smax < 0) {
        smax = maxSpeed;
      } else if (smax > maxSpeed) {
        smax = ((99 * smax) + maxSpeed) / 100;
      } else {
        smax = ((9 * smax) + maxSpeed) / 10;
      }
    }

    this.addTrack = addTrack;
    this.removeTrack = removeTrack;
    this.update = update;
    this.setTimeWindow = function(w) { timeWindow = 60*1000*w; }
    this.resetScaling = function() { smax = -1; }
  }

    sailingtracker.TrackDataIterator = function(trackSegments) {
      var hasTrackPoints = (trackSegments && trackSegments[0] && 
                            trackSegments[0].trkpts && 
                            trackSegments[0].trkpts[0]) ? true :  false;
    
      // index to trackSegments
      var currentSegment = 0, markSegment = 0; 
      // index to trackSegments[currentSegment].trkpts
      var currentPoint = -1, markPoint = -1;
      var isLastPoint = false;

      function hasNext() {
        return hasTrackPoints 
          && (currentPoint + 1 < trackSegments[currentSegment].trkpts.length
              || currentSegment + 1 < trackSegments.length);
      }

      function getNextPoint() {
        var s = currentSegment;
        var p = currentPoint + 1;
        var point;

        if (p === trackSegments[s].trkpts.length) {
          s += 1;
          p = 0;
        }

        if ((p + 1) === trackSegments[s].trkpts.length) {
          isLastPoint = true;
        }

        point = trackSegments[s].trkpts[p];

        currentSegment = s;
        currentPoint = p;

        return point;
      }

      function getPoint(playerTime) {
        // 0. sanity check
        if (!hasTrackPoints) {
          return null;
        }

        var segs = trackSegments;

        // 1. scan the segs until we find the best matching point
        var s = currentSegment;
        var p = (currentPoint === -1) ? 0 : currentPoint;	
        var prevPoint = segs[s].trkpts[p];
        var direction = (prevPoint.time > playerTime) ? -1 : 1;
        var nextPoint = null;

        isLastPoint = (p + 1) === segs[s].trkpts.length;

        gotPoint: for (; s < segs.length && s >= 0; s += direction) {

          // update currentPoint if we jumped to a new segment
          if (s !== currentSegment) {
            p = currentPoint = (direction === 1) ? 0 : segs[s].length - 1;
            currentSegment = s;
          }
			
          // search for suitable point
          for (; p < segs[s].trkpts.length && p >= 0; p += direction) {

            // the point just before playerTime is the one we want
            if (direction === -1 && 
                segs[s].trkpts[p].time <= playerTime ) {

              currentPoint = p;
              nextPoint = segs[s].trkpts[p];
              isLastPoint = (p + 1) === segs[s].trkpts.length;
              break gotPoint;
            } else if (direction === 1 && 
                       segs[s].trkpts[p].time > playerTime) {

              nextPoint = prevPoint;					
              break gotPoint;
            } else {
              currentPoint = p;
              prevPoint = segs[s].trkpts[p];
              isLastPoint = (p + 1) === segs[s].trkpts.length;
            }
          }
        }
	
        return nextPoint;
      }

      // get the time of the first track point in this track
      function getStartTime() {
        if (hasTrackPoints) {
          return trackSegments[0].trkpts[0].time;
        } else {
          // no real track will have start time this late
          // doo
          var now = Date();
			
          return now.getTime() * 2;
        }
      }	
	
      // get the time of the last track point in this track
      function getEndTime() {
        if (hasTrackPoints) {
          var lastSeg = trackSegments[trackSegments.length - 1];
          return lastSeg.trkpts[lastSeg.trkpts.length - 1].time;
        } else {
          // no real track will have end time this early
          return 0;
        }
      }

      function mark() {
        markSegment = currentSegment;
        markPoint = currentPoint;
      }

      function reset() {
        currentSegment = markSegment;
        currentPoint = markPoint;
      }

      this.hasNext = hasNext;
      this.getNextPoint = getNextPoint;
      this.getPoint = getPoint;
      this.isLastPoint = function() { return isLastPoint; }
      this.getTrackSegments = function() { return trackSegments; }
      this.hasTrackPoints = function() { return hasTrackPoints; }
      this.getStartTime = getStartTime;
      this.getEndTime = getEndTime;

      this.mark = mark;
      this.reset = reset;
    }

    /**
     * A Track
     */
      sailingtracker.Track = function(aGpxData) {

        var infoArea = null;
        var marker = null;

        // init
        var gpx = aGpxData && aGpxData.gpx ? aGpxData.gpx : aGpxData;
        
        var hasTrack = gpx && gpx.trks && gpx.trks[0];

        var trackIterator = 
        new sailingtracker.TrackDataIterator((hasTrack && gpx.trks[0].trksegs) ? 
                                             gpx.trks[0].trksegs : 
                                             null);

        var timeFix = (hasTrack && gpx.trks[0].timeFix) ? gpx.trks[0].timeFix : 0;

        var currentLatLng = null;
        var currentPoint = null;

        // pre-calculate speeds and make timefix
        (function() {
          if (!trackIterator.hasTrackPoints()) return; // sanity check

          trackIterator.mark();

          var ps = [];
          var c, d, i, p, t;

          while (trackIterator.hasNext()) {
            p = trackIterator.getNextPoint();
            p.time = p.time + timeFix;

            for (i = ps.length - 1; i >= 0; i--) {
              if (ps[i].time <= p.time - 5000) { // 5s averages
                db = sailingtracker.distanceAndBearing(ps[i], p);
                p.speed = db[0] / ((p.time - ps[i].time) / 1000);
                p.bearing = db[1];
                // remove measurements before (t - 5s)
                ps = ps.slice(i);
                break;
              }
            }

            if (trackIterator.isLastPoint()) {
              ps.length = 0;
            } else {
              ps.push(p);
            }
          }

          trackIterator.reset();
        })();

        function setMarker(aMarker) {
          marker = aMarker;
        }

        function setInfoArea(aInfoArea) {
          infoArea = aInfoArea;
        }
    
        // move the marker based on the playerTime to the appropriate place or hide
        function updatePlayerTime(playerTime) {
          var prevPoint = currentPoint;
          currentPoint = trackIterator.getPoint(playerTime);

          // 2. move marker to the point or hide if playerTime is not on segment
          if (currentPoint === null || trackIterator.isLastPoint()) {
            // hide marker (##TODO## or better yet: change it to "lost signal" marker)
            if (marker) {
              marker.setVisible(false);
            }
	    
            if (infoArea) {
              infoArea.setSpeedAndBearing(0, 0);
              infoArea.setPosition(null);
            }

            currentLatLng = null;
          } else if (prevPoint && (currentPoint.time === prevPoint.time)) {
            return;
          } else {
            currentLatLng = new google.maps.LatLng(currentPoint.lat, currentPoint.lon);

            if (marker) {
              marker.setVisible(true);
              marker.setPosition(currentLatLng);
            }

            if (infoArea) {
              infoArea.setSpeedAndBearing(currentPoint.speed,
                                          currentPoint.bearing);
              infoArea.setPosition(currentLatLng);
            }
          }
        }

        function getDescription() {
          var hasMetadata = gpx && gpx.metadata;
          if (hasMetadata && gpx.metadata.author && gpx.metadata.author.name) {
            return gpx.metadata.author.name;
          } else if (hasMetadata && gpx.metadata.desc) {
            return gpx.metadata.desc;
          } else if (hasMetadata && gpx.metadata.name) {
            return gpx.metadata.name;
          } else if (gpx && gpx.trks && (gpx.trks.length >= 1) 
                     && gpx.trks[0].name) {
            return gpx.trks[0].name;
          } else {
            return "anonymous";
          }
        }

        function getBounds() {
          var bounds, p, ti;
          if (gpx && gpx.metadata && gpx.metadata.bounds) {
            bounds = gpx.metadata.bounds;
          } else if (gpx.bounds) {
            bounds = gpx.bounds;
          } else if (trackIterator.hasTrackPoints()) {
            bounds = null;
            ti = 
            new sailingtracker.TrackDataIterator(trackIterator.getTrackSegments());
            while (ti.hasNext()) {
              p = ti.getNextPoint();

              if (!bounds) {
                bounds = {minlat:p.lat,maxlat:p.lat,minlon:p.lon,maxlon:p.lon};
              } else {
                bounds.minlat = p.lat < bounds.minlat ? p.lat : bounds.minlat;
                bounds.maxlat = p.lat > bounds.maxlat ? p.lat : bounds.maxlat;
                bounds.minlon = p.lon < bounds.minlon ? p.lon : bounds.minlon;
                bounds.maxlon = p.lon > bounds.maxlon ? p.lon : bounds.maxlon;
              }
            }
          } else {
            bounds = null;
          }

          return bounds;
        }
	
        this.setMarker = setMarker;
        this.setInfoArea = setInfoArea;
        this.getMarker = function() { return marker; }
        this.getInfoArea = function() { return infoArea; }
        this.updatePlayerTime = updatePlayerTime;
        this.getCurrentLatLng = function() { return currentLatLng; }
        this.getSpeed = function() { return speed; }
        this.hasTrackPoints = function() { return trackIterator.hasTrackPoints(); }
        this.getStartTime = function() { return trackIterator.getStartTime(); }
        this.getEndTime = function() { return trackIterator.getEndTime(); }
        this.getBounds = getBounds;
        this.getDescription = getDescription;
        this.getTrackDataIterator = function() { 
          return new sailingtracker.TrackDataIterator(trackIterator.getTrackSegments()); 
        }
      }

        sailingtracker.Player = function(aMap) {
          var self = this;
          // frames-per-second, i.e. how many times to update
          // the markers and the map in one second
          var FPS = 10;
	
          // the GMap that we will keep updating
          var map = aMap;
	
          // an array of Track objects
          var tracks = [];
	
          // a Track whose current position should be
          // in the center of the map display
          var followTrack = null;
	
          // a timeout key
          var timer = null;
	
          // isRunning
          var isRunning = false;	
	
          // the player speed, i.e. how many player seconds
          // to play in one real second. Can be negative for
          // reverse playback
          var playerSpeed = 1; // 1:1
          var lastTickTime = 0;
	
          // the absolute startTime and endTime
          var startTime = 0;
          var endTime = new Date().getTime();
          var bounds = {minlat:-90,maxlat:90,minlon:-180,maxlon:180};
	
          // the time in the players universe
          var playerTime = 0;

          // a callback function
          var updateCallback = null;

          function setUpdateCallback(aUpdateCallback) {
            updateCallback = aUpdateCallback;
          }
	
          function updateStartEndTimes() {
            var st = 0;
            var et = 0;
            var i = 0;
            var t = null;
            var b = null;
            bounds = {minlat:90,maxlat:-90,minlon:180,maxlon:-180};
		
            for (i = 0; i < tracks.length; i++) {
              t = tracks[i];
              b = t.getBounds();

              if (st === 0 || t.getStartTime() < st) {			  
                st = t.getStartTime();
              }
				
              if (t.getEndTime() > et) {
                et = t.getEndTime();
              }

              if (b != null) {
                bounds.minlat = b.minlat < bounds.minlat ? b.minlat : bounds.minlat;
                bounds.maxlat = b.maxlat > bounds.maxlat ? b.maxlat : bounds.maxlat;
                bounds.minlon = b.minlon < bounds.minlon ? b.minlon : bounds.minlon;
                bounds.maxlon = b.maxlon > bounds.maxlon ? b.maxlon : bounds.maxlon;
              }
            }
		
            startTime = st;
            endTime = et;

            if (tracks.length === 0) {
              startTime = 0;
              endTime = new Date().getTime();
              bounds = {minlat:-90,maxlat:90,minlon:-180,maxlon:180};
              toStart();
            } else if (playerTime < startTime ||
                       playerTime > endTime) {
              toStart();
            }
          }
	
          // add the given track to this player
          function addTrack(gpxDataUrl, aTrack) {
            var i = 0;

            if (aTrack.hasTrackPoints()) {
              // check that we don't have the track already
              for (i = 0; i < tracks.length; i++) {
                if (tracks[i] === aTrack) {				  
                  return;
                }
              }
		
              tracks.push(aTrack);
              aTrack.gpxDataUrl = gpxDataUrl;
              updateStartEndTimes();
            }
          }	
	
          function removeTrack(aTrack) {
            // aTrack can be a track or a gpxDataUrl
            var i = 0;
            for (i = 0; i < tracks.length; i++) {
              if (tracks[i] === aTrack || tracks[i].gpxDataUrl == aTrack) {
                tracks.splice(i, 1);
                updateStartEndTimes();
              }
            }
          }
	
          function getTracks() {
            return tracks;
          }

          function contains(gpxDataUrl) {
            for (i = 0; i < tracks.length; i++) {
              if (tracks[i].gpxDataUrl === gpxDataUrl) {				  
                return true;
              }
            }

            return false;
          }
	
          function updateTracks() {
            // loop through the markers and update them
            var i = 0;
            for (i = 0; i < tracks.length; i++) {
              tracks[i].updatePlayerTime(playerTime);
            }
          }
	
          function updateMap() {
            if (followTrack !== null) {
              var point = followTrack.getCurrentLatLng();
              var bounds = map.getBounds();
              if (!sailingtracker.shrink(bounds, 0.1).contains(point)) {
                map.panTo(point);
              }
            }
          }
	
          function getElapsedTime() {
            var elapsed = playerTime - startTime;
            return (elapsed > 0) ? elapsed : 0;
          }	
	
          function getPlayerTime() {
            return (playerTime > 0) ? playerTime : startTime;
          }
	
          function follow(aTrack) {
            followTrack = aTrack;
          }
	
          function jumpTo(aElapsedTime) {
            var pt = startTime + aElapsedTime;
		
            if (pt > endTime) {
              pt = endTime;
            } else if (pt < startTime) {
              pt = startTime;
            }
		
            playerTime = pt;
		
            updateTracks();
            updateMap();
            if (updateCallback !== null && 
                typeof updateCallback === "function") {
              updateCallback(self);
            }
          }
	
          function toStart() {
            jumpTo(0);
          }
	
          function toEnd() {
            jumpTo(endTime); // endTime is sure to be larger than maximum elapsedTime
          }
	
          // how many seconds of track to show in one real second
          // can also be negative (in which case time goes backwards)
          function setSpeed(aSpeed) {
            playerSpeed = aSpeed;
          }

          function getSpeed() {
            return playerSpeed;
          }
	
          function tick() {
            var now;

            updateTracks();
            updateMap();
            if (updateCallback !== null && 
                typeof updateCallback === "function") {
              updateCallback(self);
            }

            if (!isRunning) {
              // nop
            } else if (tracks.length === 0) {
              isRunning = false;
            } else if (playerTime > endTime || 
                       playerTime < startTime) {				
              isRunning = false; // stop now
            } else {
              now = (new Date()).getTime();
              //$("#tick").text("" + (now - lastTickTime));
              playerTime +=  (now - lastTickTime) * playerSpeed;
              lastTickTime = now;
              setTimeout(tick, 1000 / FPS);
            }
          }
	
          function start() {

            // set player time to "start position"
            if (playerTime >= endTime || playerTime <= startTime) {
              if (playerSpeed >= 0) { // normal playback
                toStart();
              } else { // reverse playback
                toEnd();
              }
            } 

            isRunning = true;
            lastTickTime = (new Date()).getTime();
            tick();
          }
	
          function stop() {
            isRunning = false;		
            if (timer !== null) {
              clearTimeout(timer);
            }
          }

          this.setUpdateCallback = setUpdateCallback;
          this.addTrack = addTrack;
          this.removeTrack = removeTrack;
          this.getTracks = getTracks;
          this.contains = contains;
          this.hasTracks = function() { return tracks.length > 0; }
          this.getElapsedTime = getElapsedTime;
          this.getMaxElapsedTime = function() { return (endTime - startTime) };
          this.getPlayerTime = getPlayerTime;
          this.follow = follow;
          this.jumpTo = jumpTo;
          this.toStart = toStart;
          this.getStartTime = function() { return startTime };
          this.toEnd = toEnd;
          this.getEndTime = function() { return endTime };
          this.getBounds = function() { return bounds };
          this.setSpeed = setSpeed;
          this.getSpeed = getSpeed;
          this.stop = stop;
          this.start = start;
        }
