/* Copyright (c) 2009 Heikki Vesalainen. All rights reserved. */

google.load("maps", "3", {"other_params":"sensor=true"});
google.load("jquery", "1.4.2");
google.load("jqueryui", "1.7.2");

/*
 * namespace
 */
var sailingtracker = sailingtracker ? sailingtracker : {};
sailingtracker.trackIndexUrl = "/tracks/index.json";
sailingtracker.markerCounter = 0;
sailingtracker.trackStart = 0;
sailingtracker.trackEnd = 0;
var updateTracksEvent;

sailingtracker.loadTrackList = function() {
  $("#othertracks").hide();

  // $.getJSON chokes on 10MB json files so we need to get the json as
  // text and then eval it here.
  $.get(sailingtracker.trackIndexUrl, function(trackListText) {
      var trackList = eval("(" + trackListText + ")");
      var li,i,t,tspan;
      var ol = $("#tracklist");

      function tspan(trackMeta) {
        var s = ((trackMeta.maxtime - trackMeta.mintime) / 1000).toFixed();
        if (s < 60) {
          return s + " s";
        }
        s = (s / 60).toFixed();
        if (s < 60) {
          return s + " min";
        }
        return (s / 60).toFixed() + " h";
      }

      // sort newest first
      trackList.sort(function(t1, t2) {
          return t2.mintime - t1.mintime;
        });
      
      for (i = 0; i < trackList.length; i++) {
        t = trackList[i];
        li = document.createElement("li");
        li.sailingtracker = {};
        li.sailingtracker.trackMeta = t;
        $(li)
          .append("<a href='" + t.path + 
                  "' onclick=\"return sailingtracker.addTrack('" + 
                  t.path.replace(/.gpx$/, ".json") + "');\">" + 
                  t.trackName +"</a>")
          .append("<span>" + new Date(t.mintime).toLocaleString() + " (" + tspan(t) + ")</span>");
        
        ol.append(li);
	    }
      sailingtracker.updateTrackList();
    }, "text");
};

sailingtracker.updateTrackList = function() {
  var start = sailingtracker.player.getStartTime();
  var end = sailingtracker.player.getEndTime();
  var bounds = sailingtracker.player.getBounds();
  
  start -= 10*60*1000; // extend 10 mins
  end += 10*60*1000; 
      
  if (sailingtracker.player.hasTracks()) {
    $("#tracklist li").each(function (i) {
        var t = this.sailingtracker.trackMeta;
        if ((t.maxtime < start || t.mintime > end) ||
            (t.maxlon < bounds.minlon || t.minlon > bounds.maxlon) ||
            (t.maxlat < bounds.minlat || t.minlat > bounds.maxlat) ||
            sailingtracker.player.contains(t.path.replace(/.gpx$/, ".json"))) {
        $(this).hide();
      } else {
        $(this).show();
      }
      });
  } else {
    // show all
    $("#tracklist li").show();
  }

  if (sailingtracker.player.hasTracks()) {
    $("#choosetrack").hide();
    if ($("#tracklist li:visible").length > 0) {
      $("#othertracks").show();
    } else {
      $("#othertracks").hide();
    }
    $("#controls").show();
  } else {
    $("#choosetrack").show();
    $("#othertracks").hide();
    $("#controls").hide();
  }
};

sailingtracker.createIcon = function() {
  var markerImage = sailingtracker.markers[sailingtracker.markerCounter++];
  var url = sailingtracker.markersDir + markerImage;
  var icon = new google.maps.MarkerImage(url,
                                         new google.maps.Size(19,19),
                                         null,
                                         new google.maps.Point(10,19),
                                         null);

  // add our own property
  icon.color = markerImage.split(".")[0];
  icon.url = url;
  return icon;
};

sailingtracker.addTrack = function(gpxDataUrl) {
  if (/index2.html$/.test(location.href) || 
      !sailingtracker.player.hasTracks()) {
    location.href = "gpxplayer.html#?t=" + gpxDataUrl;
    
    if (/index2.html$/.test(location.href)) {
      // no need to continue since we are going to
      // be redirected to gpxplayer.
      return false;
    }
  }

  var icon = sailingtracker.createIcon();
  var li = document.createElement("li");
  $(li).text(" [loading]").prepend("<img src='" + icon.url + "'/>");
  $("#selectedtracks").append(li);
  $("#tracklist li").hide();
  $("#choosetrack").hide();

  // $.getJSON chokes on 10MB json files so we need to get the json as
  // text and then eval it here.
  $.get(gpxDataUrl, function(gpxDataText) {
      var gpxData = eval("(" + gpxDataText + ")");
      var track = new sailingtracker.Track(gpxData);
      var point, marker, title, infoArea, gbounds, bounds
	    
      if (track.hasTrackPoints()) {
        point = track.getTrackDataIterator().getNextPoint();
        point = new google.maps.LatLng(point.lat, point.lon)
          title = track.getDescription();
        
        marker = new google.maps.Marker({flat: true,
                                         icon: icon,
                                         map: sailingtracker.map,
                                         position: point});
        track.setMarker(marker);
        
        infoArea = new sailingtracker.InfoArea(sailingtracker.map);
        infoArea.setMap(sailingtracker.map);
        track.setInfoArea(infoArea);
        
        sailingtracker.speedgraph.addTrack(track, icon.color);
      }
      
      // update track list
      li.sailingtracker = {};
      li.sailingtracker.track = track;
      li.sailingtracker.track.color = icon.color;
      $(li)
      .text(" " + track.getDescription())
      .prepend("<img src='" + icon.url + "'/>")
      .append(" <a class='follow' href='#' onclick='return sailingtracker.follow(this)'>[follow]</a>")
      .append(" <a class='track' href='#' onclick='return sailingtracker.toggleTrack(this)'>[toggle track]</a>")
      .append(" <a class='remove' href='#' onclick='return sailingtracker.removeTrack(this)'>[remove]</a>");

      // add to player
      sailingtracker.player.addTrack(gpxDataUrl, track);
      if (sailingtracker.player.getTracks().length === 1) {
        sailingtracker.follow(li.firstChild);
      }
      
      bounds = sailingtracker.player.getBounds();
      gbounds = new google.maps.LatLngBounds(new google.maps.LatLng(bounds.minlat, bounds.minlon), 
                                             new google.maps.LatLng(bounds.maxlat, bounds.maxlon));
      sailingtracker.map.setCenter(gbounds.getCenter());
      sailingtracker.map.fitBounds(gbounds);

      sailingtracker.updateTimebar();
      sailingtracker.updateTrackList();
      sailingtracker.updateTimeSelector();
    }, "text");
  return false;
};

sailingtracker.follow = function(aElement) {
  $("li.follow").removeClass("follow");
  if (aElement != null) {
    var li = aElement.parentNode;
    $(li).addClass("follow");
    var track = li.sailingtracker.track;
    sailingtracker.player.follow(track);
  } else {
    sailingtracker.player.follow(null);
  }
  return false;
};

sailingtracker.polylineEncoder = new PolylineEncoder(18, 2, 0.000005);

sailingtracker.createPolylines = function(track, color, start, end) {
  var trackIterator = track.getTrackDataIterator();
  var points, polylines;
  var i, j;
	
  // create and add polyline(s)
  polylines = [];

  if (trackIterator.hasTrackPoints()) {
    while (trackIterator.hasNext()) {
	    points = [];
	    while (trackIterator.hasNext()) {
        point = trackIterator.getNextPoint();
        if (point.time >= start && point.time <= end) {
          points.push(new google.maps.LatLng(point.lat, point.lon));
        }
        if (trackIterator.isLastPoint()) {
          break;
        }
	    }
	    
	    polylines.push(new google.maps.Polyline({
            path: points,
              strokeColor: color,
              strokeOpacity: 0.4,
              strokeWeight: 3
              }));
    }
  }

  polylines.start = start;
  polylines.end = end;

  return polylines;
};

/*
sailingtracker.createPolylines = function(track, color) {
  var trackIterator = track.getTrackDataIterator();
  var points, polylines;
  var i, j;
	
  // create and add polyline(s)
  polylines = [];

  if (trackIterator.hasTrackPoints()) {
    while (trackIterator.hasNext()) {
	    points = [];
	    while (trackIterator.hasNext()) {
        point = trackIterator.getNextPoint();
        points.push(new google.maps.LatLng(point.lat, point.lon));
        if (trackIterator.isLastPoint()) {
          break;
        }
	    }
	    
	    polylines.push(new google.maps.Polyline({path:points,
              strokeColor: color,
              strokeWeigth: 3,
              strokeOpacity: 0.2}));
    }
  }

  return polylines;
};*/

sailingtracker.toggleTrack = function(aElement) {
  var track = aElement.parentNode.sailingtracker.track;
  var color = track.color;
  var i;

  if (track.polylines &&
      (track.polylines.start != sailingtracker.trackStart ||
       track.polylines.end != sailingtracker.trackEnd)) {
    for (i = 0; i < track.polylines.length; i++) {
      track.polylines[i].setMap(null)
    }

    track.polylines = false;
  }

  if (!track.polylines) {
    // no polylines created, create now
    track.polylines = 
      sailingtracker.createPolylines(track, color, 
                                     sailingtracker.trackStart,
                                     sailingtracker.trackEnd);
	
    for (i = 0; i < track.polylines.length; i++) {
      track.polylines[i].setMap(sailingtracker.map);
    }
  } else {
    // polylines exists, toggle
    for (i = 0; i < track.polylines.length; i++) {
      track.polylines[i].setVisible(!track.polylines[i].visible);
    }
  }

  return false;
};

sailingtracker.updateTracks = function() {
  clearTimeout(updateTracksEvent);

  updateTracksEvent = setTimeout(function() {
      var tracks = sailingtracker.player.getTracks();
      var i, j;

      for (i = 0; i < tracks.length; i++) {
        if (tracks[i].polylines) {
          for (j = 0; j < tracks[i].polylines.length; j++) {
            tracks[i].polylines[j].setMap(null);
          }
          tracks[i].polylines = 
            sailingtracker.createPolylines(tracks[i], tracks[i].color, 
                                           sailingtracker.trackStart,
                                           sailingtracker.trackEnd);
          
          for (j = 0; j < tracks[i].polylines.length; j++) {
            tracks[i].polylines[j].setMap(sailingtracker.map);
          }
        }
      }
    }, 100);
  
}

sailingtracker.removeTrack = function(aElement) {
  var li = aElement.parentNode;
  var track = li.sailingtracker.track;
  var i;

  li.parentNode.removeChild(li);
  sailingtracker.player.removeTrack(track);

  if (!sailingtracker.player.hasTracks()) {
    location.href = location.href.replace(/#.*/, "?empty");
    return false;
  }

  sailingtracker.speedgraph.removeTrack(track);
  track.getMarker().setMap(null);
  track.getInfoArea().setMap(null);

  if (track.polylines) {
    for (i = 0; i < track.polylines.length; i++) {
      track.polylines[i].setMap(null);
    }
  }

  sailingtracker.updateTimebar();
  sailingtracker.speedgraph.resetScaling();
  sailingtracker.updateTrackList();
  sailingtracker.updateTimeSelector();
  
  return false;
};

sailingtracker.updateUI = function(player) {
  //  $("#time").val((player.getElapsedTime()/1000));
  if (player.getPlayerTime() != 0) {
    $("#playertime").text(new Date(player.getPlayerTime()).toLocaleString());
  } else {
    $("#playertime").text("");
  }
  sailingtracker.speedgraph.update(player.getPlayerTime());
  sailingtracker.updateTimebar();
};

sailingtracker.updateTimebar = function() {
  $("#time").
  slider("option", "max", sailingtracker.player.getMaxElapsedTime()).
  slider("value", sailingtracker.player.getElapsedTime());
};

sailingtracker.updateTimeSelector = function() {
  var slider = $("#tracktime");
  var currentValues = slider.slider("values");
  var currentMin = slider.slider("option", "min");
  var currentMax = slider.slider("option", "max");

  slider.
  slider("option", "min", sailingtracker.player.getStartTime()).
  slider("option", "max", sailingtracker.player.getEndTime());

  if (currentValues[0] == currentMin && currentValues[1] == currentMax) {
    slider.slider("option", "values", [sailingtracker.player.getStartTime(), 
                                       sailingtracker.player.getEndTime()]);
  }

  currentValues = slider.slider("values");

  sailingtracker.trackStart = currentValues[0];
  sailingtracker.trackEnd = currentValues[1];

  slider.slider("enable");
}

google.setOnLoadCallback(function() {
    sailingtracker.InfoArea.prototype = new google.maps.OverlayView();

    var speedgraph = new sailingtracker.SpeedGraph(document.getElementById("speedgraph"));
    sailingtracker.speedgraph = speedgraph;

    var map = new google.maps.Map(document.getElementById("map"), 
                                  {mapTypeId: google.maps.MapTypeId.ROADMAP,
                                   zoom: 1,
                                   scaleControl: true,
                                   center: new google.maps.LatLng(0, 0)});

    google.maps.event.addListener(map, "drag", function() { sailingtracker.follow(null); });
    google.maps.event.addListener(map, "click", function() { sailingtracker.follow(null); });
    sailingtracker.map = map;

    sailingtracker.player = new sailingtracker.Player(sailingtracker.map);
    var speed = parseInt($("#speed").val());
    sailingtracker.player.setSpeed(speed);
    sailingtracker.speedgraph.setTimeWindow(Math.log(speed + 1) + (speed/60));
    sailingtracker.player.setUpdateCallback(sailingtracker.updateUI);

    $("form#addgpx").submit(function() {
        try {
          var gpxfile = $("#gpxfile");
          if (gpxfile.val()) {
            sailingtracker.addTrack(gpxfile.val());
          }
          gpxfile.val("");
        } catch (e) {
          alert(e);
        }
        return false;
      });

    $("#play").click(function() {
        sailingtracker.player.start();
        return false;
      });

    $("#stop").click(function() {
        sailingtracker.player.stop();
        return false;
      });
    $("#speed").change(function() {
        var speed = parseInt($("#speed").val());
        sailingtracker.player.setSpeed(speed);
        sailingtracker.speedgraph.setTimeWindow(Math.log(speed + 1) + (speed/60));
        sailingtracker.speedgraph.resetScaling();
      });
    $("#time").slider({
        max: 0, slide: function(event, ui) { 
          sailingtracker.player.jumpTo(ui.value); 
          sailingtracker.speedgraph.resetScaling();
        }
      });
    $("#tracktime").slider({
        range: true, min: 0, max: 0, slide: function(event, ui) {
          sailingtracker.trackStart = ui.values[0];
          sailingtracker.trackEnd = ui.values[1];
          sailingtracker.updateTracks();
          $("#trackselection").text("(showing track from " + 
                                    new Date(sailingtracker.trackStart).toLocaleTimeString() + 
                                    " to " + 
                                    new Date(sailingtracker.trackEnd).toLocaleTimeString() +
                                    ")")
        }
      });


    // Load tracks from URL. Potential injection vector.
    var trackr = /[&?]t=[^&]*/g;
    var tracks = location.href.match(trackr);
    if (tracks) {
      for (i = 0; i < tracks.length; i++) {
        sailingtracker.addTrack(decodeURI(tracks[i].split("=",2)[1]));
      }
    }

    sailingtracker.loadTrackList();
  });

