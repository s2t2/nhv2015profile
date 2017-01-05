//////////// global variables

var chartAttr = {
    fullwidth: 640,
    fullheight: 60,
    top: 0, right: 40, bottom: 20, left: 180,
    zoomFull: 360,
    r: 16
};
chartAttr.width = chartAttr.fullwidth - chartAttr.left - chartAttr.right;
chartAttr.height = chartAttr.fullheight - chartAttr.top - chartAttr.bottom;
chartAttr.zoomHeight = chartAttr.zoomFull - chartAttr.top - chartAttr.bottom;

var mapAttr = {
    fullwidth: 524,
    fullheight: 524,
    top: 12, right: 12, bottom: 20, left: 12
};
mapAttr.width = mapAttr.fullwidth - mapAttr.left - mapAttr.right;
mapAttr.height = mapAttr.fullheight - mapAttr.top - mapAttr.bottom;

/////////////////////////////////

d3.queue()
    .defer(d3.json, 'json/nhv_shape2.json')
    .defer(d3.csv, 'data/nhv_data2.csv')
    .await(init);

///////////////////// INITIALIZE: CALL DRAWDOTS, DRAWMAP, TRIGGER TOPIC MENU CHANGE
function init(error, json, csv) {
    if (error) throw error;

    // prep & nest data
    csv.forEach(function(d) {
        d.value = +d.value;
    });
    var nested = d3.nest()
        .key(function(d) { return d.indicator; })
        .sortValues(function(a, b) { return a.order - b.order; })
        .sortValues(function(a, b) { return b.value - a.value; })
        .entries(csv);
    nested.forEach(function(d) {
        d.topic = d.values[0].topic;
        d.order = +d.values[0].order;
    });

    var byTopic = d3.nest()
        .key(function(d) { return d.topic; })
        .sortValues(function(a, b) { return a.order - b.order; })
        .entries(csv);
    byTopic.forEach(function(d) {
        d.displayTopic = d.values[0].displayTopic;
    });

    // make menus
    d3.select('#topicMenu')
        .selectAll('option')
        .data(byTopic)
        .enter().append('option')
            .attr('value', function(d) { return d.key; })
            .text(function(d) { return d.displayTopic; });
    $('#topicMenu').on('change', {nested: nested}, changeTopic);
    $('#indicMenu').on('change', {csv: csv}, changeIndic);

    drawDots(nested);
    drawMap(json);

    // DO THIS LAST
    $('#topicMenu').change();
}

function changeTopic(event) {
    var topic = this.value;
    var displayTopic = $('#topicMenu').children('option:selected').text();
    $('#chart-title').text(displayTopic);
    $('#indicMenu').empty();

    var nested = event.data.nested;

    var filtered = nested.filter(function(d) {
        return d.topic === topic;
    });

    var indics = d3.select('#indicMenu')
        .selectAll('option')
        .data(filtered)
        .enter().append('option')
            .attr('value', function(d) { return d.key; })
            .attr('data-topic', function(d) { return d.topic; })
            .sort(function(a, b) { return a.order - b.order; })
            .text(function(d) { return d.key; });

    d3.selectAll('.chart-div')
        .style('display', 'none')
        .filter(function(d) { return d.topic === topic; })
            .style('display', 'block');
    // change indicator after menu options are set
    $('#indicMenu').children('option').eq(0).attr('selected', true);
    $('#indicMenu').change();
}

function changeIndic(event) {
    var indic = this.value;
    $('#map-title').text(indic);
    // use csv data passed in to fill map polygons via d3.selectAll('.polygon')
    var csv = event.data.csv;
    colorMap(csv, indic);
}

function drawDots(nested) {
    // set xscale for each multiple, not here
    var divs = d3.select('#chart')
        .selectAll('.chart-div')
        .data(nested)
        .enter().append('div')
            .attr('class', 'chart-div')
            .sort(function(a, b) { return a.order - b.order; })
            .each(makeMultiple);
}

function makeMultiple(indicator) {
    var div = d3.select(this);
    var isZoomed = false;

    // scales
    var xscale = d3.scaleLinear()
        .domain(d3.extent(indicator.values, function(d) { return d.value; }))
        .range([0, chartAttr.width])
        .nice();
    var yscale = d3.scaleBand()
        .domain(indicator.values.map(function(d) { return d.Neighborhood; }))
        .rangeRound([0, chartAttr.zoomHeight])
        .padding(0.2);

    var xaxis = d3.axisBottom()
        .scale(xscale)
        .ticks(4, '%');
    var yaxis = d3.axisLeft().scale(yscale);

    // drawing attributes
    var r = chartAttr.r;
    // break in two parts, one for each transition
    var dotAttr1 = {
        width: r,
        height: r,
        rx: r,
        ry: r
    };
    var dotAttr2 = {
        x: function(d) { return xscale(d.value) - r / 2; },
        y: chartAttr.height / 2
    };
    var barAttr = {
        x: 0,
        y: function(d) { return yscale(d.Neighborhood); },
        height: yscale.bandwidth(),
        rx: 0,
        ry: 0
    };

    var labelContainer = div.append('div')
        .attr('class', 'label-container');

    // label with name of indicator
    var label = labelContainer.append('div')
        .attr('class', 'indic-label')
        .text(function(d) { return d.key; });

    // buttons to expand/collapse
    var button = labelContainer.append('button')
        .attr('type', 'button')
        .attr('class', 'btn btn-default btn-xs zoom-button')
        .text('Expand');

    // tooltip, floated to right
    var tooltip = labelContainer.append('div')
        .attr('class', 'dot-tooltip')
        .text(' ');
    tooltip.append('span').attr('class', 'tool-label');
    tooltip.append('span').attr('class', 'tool-value');

    var localsvg = div.append('svg')
        // .attr('width', chartAttr.fullwidth)
        // .attr('height', chartAttr.fullheight)
        .attr('width', '100%')
        .attr('viewBox', '0 0 ' + chartAttr.fullwidth + ' ' + chartAttr.fullheight)
        .attr('class', 'chart-svg');

    var g = localsvg.append('g')
        .attr('transform', 'translate(' + chartAttr.left + ',' + chartAttr.top + ')');

    var axis = g.append('g')
        .attr('class', 'x axis')
        .attr('transform', 'translate(0,' + chartAttr.height + ')')
        .call(xaxis);
    var hoodLabels = g.append('g')
        .attr('class', 'y axis')
        .attr('display', 'none')
        .call(yaxis);


    var dots = g.selectAll('.dot')
        .data(function(d) { return d.values; })
        .enter().append('rect')
            .attr('class', 'dot')
            .attrs(dotAttr1)
            .attrs(dotAttr2)
            .on('mouseover', mouseOverDot)
            .on('mouseout', mouseOutDot);

    button.on('click', function() {
        var newheight = isZoomed ? chartAttr.fullheight : chartAttr.zoomFull;

        // d3.selectAll('.chart-svg')
        //     .transition()
        //     .duration(500)
        //         .attr('height', chartAttr.fullheight);
        localsvg.transition()
            .duration(1000)
                .attr('viewBox', '0 0 ' + chartAttr.fullwidth + ' ' + newheight);
                // .attr('height', newheight);

        if (isZoomed) {
            // shrink bars back to dots
            xscale.domain(d3.extent(indicator.values, function(d) { return d.value; }));
            axis.transition()
                .duration(1000)
                    .attr('transform', 'translate(0,' + chartAttr.height + ')')
                    .call(xaxis);
            hoodLabels.transition()
                .duration(1000)
                    .attr('display', 'none');

            dots.transition()
                .duration(500)
                    .attr('stroke-width', 0)
                    .attrs(dotAttr1)
                .transition()
                .duration(500)
                    .attrs(dotAttr2);
            // set button text to say expand
            button.text('Expand');
        } else {
            // grow dots out to bars
            xscale.domain([0, d3.max(indicator.values, function(d) { return d.value; })]);
            axis.transition()
                .duration(1000)
                .attr('transform', 'translate(0,' + chartAttr.zoomHeight + ')')
                .call(xaxis);
            hoodLabels.transition()
                .duration(1000)
                    .attr('display', 'inline')
                    .call(yaxis);

            dots.transition()
                .duration(500)
                    .attrs(barAttr)
                .transition()
                .duration(1000)
                    .attr('width', function(d) { return xscale(d.value); });
            button.text('Collapse');
        }

        // do this last--toggle zoomed state
        isZoomed = !isZoomed;
    });

}

function mouseOverDot(dot) {
    var hood = d3.selectAll('.dot')
        .filter(function(d) { return d.Neighborhood === dot.Neighborhood; });
    hood.classed('hilite', true)
        .transition()
        .duration(200)
            .style('stroke-width', '8px');

    // tooltips are html elements with class dot-tooltip
    var tips = d3.selectAll('.dot-tooltip');
    d3.selectAll('.tool-label')
        .text(dot.Neighborhood + ': ');
    d3.selectAll('.tool-value')
        .text(function(d) {
            var vals = d.values
                .filter(function(a) { return a.Neighborhood === dot.Neighborhood; });
            return d3.format('.0%')(vals[0].value);
        });

    // highlight map polygon filtered for same neighborhood
    d3.selectAll('.polygon')
        .filter(function(d) { return d.properties.Neighborhood === dot.Neighborhood; })
            .classed('map-hover', true);
}

function mouseOutDot(dot) {
    var hood = d3.selectAll('.dot')
        .filter(function(d) { return d.Neighborhood === dot.Neighborhood; });

    // d3.selectAll('.dot')
    hood.classed('hilite', false)
        .transition()
        .duration(200)
            .style('stroke-width', '0');
    // clear tooltip text
    d3.selectAll('.dot-tooltip')
        .selectAll('span')
        .text('');

    // unhighlight all map polygons
    d3.selectAll('.polygon')
        .classed('map-hover', false);
}

function drawMap(topo) {
    var svg = d3.select('#map')
        .append('svg')
        .attr('id', 'mapSVG')
        .attr('width', '100%')
        .attr('viewBox', '0 0 ' + mapAttr.fullwidth + ' ' + mapAttr.fullheight);
        // .attr('width', mapAttr.fullwidth)
        // .attr('height', mapAttr.fullheight);

    var proj = d3.geoMercator()
        .center([-72.929916, 41.310726])
        .scale(185000)
        .translate([mapAttr.width / 2, mapAttr.height * 1 / 2.5]);

    var path = d3.geoPath().projection(proj);

    var polygons = svg.append('g')
        .attr('transform', 'translate(' + mapAttr.left + ',' + mapAttr.top + ')')
        .selectAll('path')
        .data(topojson.feature(topo, topo.objects.nhv_shape).features)
        .enter().append('path')
            .attr('d', path)
            .attr('class', 'polygon');
}

function colorMap(csv, indicator) {
    // clear previous legend
    d3.select('.legendQuant').remove();

    var nested = d3.nest()
        .key(function(d) { return d.indicator; })
        .map(csv);

    var indicValues = nested.get(indicator);

    var tip = d3.tip()
        .attr('class', 'd3-tip');

    var color = d3.scaleQuantize()
        .domain(d3.extent(indicValues, function(d) { return +d.value; }))
        .range(d3.schemePurples[5]);

    // object to match names of neighborhoods with values from indicValues
    var hoodMap = {};
    indicValues.forEach(function(d) {
        hoodMap[d.Neighborhood] = +d.value;
    });

    var polygons = d3.selectAll('.polygon')
        .attr('fill', function(d) {
            var value = hoodMap[d.properties.Neighborhood];
            if (typeof value === 'undefined') {
                return '#bbb';
            } else {
                return color(value);
            }
        });
    polygons.call(tip)
        .on('mouseover', function() {
            tip.html(mouseOverPoly(d3.select(this), hoodMap));
            tip.show();
        })
        .on('mouseout', function() {
            tip.hide();
            mouseOutPoly(d3.select(this));
        });

    // draw legend
    var svg = d3.select('#mapSVG');
    svg.append('g')
        .attr('class', 'legendQuant')
        .attr('transform', 'translate(30,' + 400 + ')');
    var legend = d3.legendColor()
        .labelFormat(d3.format('.0%'))
        .useClass(false)
        .scale(color);
    svg.select('.legendQuant').call(legend);
}

function mouseOverPoly(poly, hoodMap) {
    var hood = poly.datum().properties.Neighborhood;
    var value = hoodMap[hood];
    var valText = typeof value === 'undefined' ? 'N/A' : d3.format('.0%')(value);
    // tip.html('<span class="tip-label">' + hood + ': </span>' + valText);
    // d3.select(this).classed('map-hover', true);
    poly.classed('map-hover', true);

    // highlight dots with same neighborhood
    d3.selectAll('.dot')
        .filter(function(d) { return d.Neighborhood === hood; })
            .classed('hilite', true)
            .transition()
            .duration(200)
                .style('stroke-width', '8px');
    // return to tip.html
    return '<span class="tip-label">' + hood + ': </span>' + valText;
}

function mouseOutPoly(poly) {
    poly.classed('map-hover', false);
    d3.selectAll('.dot').classed('hilite', false)
        .transition()
        .duration(200)
            .style('stroke-width', 0);
}
