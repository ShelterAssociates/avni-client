import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, ScrollView } from 'react-native';
import { WebView } from 'react-native-webview';
import * as turf from '@turf/turf';
import RNFS from 'react-native-fs';
import AbstractComponent from '../framework/view/AbstractComponent';
import Path from '../framework/routing/Path';
import TypedTransition from '../framework/routing/TypedTransition';
import IndividualService from '../service/IndividualService';
import ConceptService from '../service/ConceptService';

const GIS_DIR = `${RNFS.DocumentDirectoryPath}/gis`;

// Exact concept names as they appear in Avni (from debug output)
const FILTER_CONCEPTS = [
    'Type of structure occupancy_1',
    'Do you have a toilet at home?',
    'Are you interested in an individual toilet ?',
];

// Display labels for the chips (shorter versions)
const FILTER_LABELS = {
    'Type of structure occupancy_1': 'Occupancy Type',
    'Do you have a toilet at home?': 'Has Toilet',
    'Are you interested in an individual toilet ?': 'Wants Toilet',
};

const COLOR_PALETTE = [
    '#E74C3C', '#3498DB', '#2ECC71', '#F39C12',
    '#9B59B6', '#1ABC9C', '#E67E22', '#C0392B',
    '#2980B9', '#27AE60', '#D35400', '#8E44AD',
];

@Path('/mapPickerScreen')
class MapPickerScreen extends AbstractComponent {

    constructor(props, context) {
        super(props, context);
        this.state = {
            geojson: null,
            selected: null,
            selectedExistingUuid: null,
            loading: true,
            filterLoading: false,
            center: null,
            statusMap: {},
            conceptMap: {},
            conceptColors: {},
            conceptLegend: [],  // [{answer, color}]
            selectedConcept: null,
            searchText: '',
        };
        this.webViewRef = React.createRef();
    }

    viewName() {
        return 'MapPickerScreen';
    }

    componentDidMount() {
        this.loadLocalGeoJson();
        this.loadSurveyStatus();
    }

    loadSurveyStatus() {
        try {
            const individualService = this.context.getService(IndividualService);
            const allSubjects = individualService.findAll();
            const statusMap = {};
            allSubjects.forEach(subject => {
                if (subject.firstName) {
                    const name = String(subject.firstName).trim();
                    const entry = { status: 'registered', uuid: subject.uuid };
                    statusMap[name] = entry;
                    const asInt = String(parseInt(name, 10));
                    if (asInt !== 'NaN') statusMap[asInt] = entry;
                    statusMap[name.padStart(4, '0')] = entry;
                }
            });
            this.setState({ statusMap });
        } catch (e) {
            this.setState({ statusMap: {} });
        }
    }

    // Read answer value from a single observation's valueJSON
    resolveObsValue(obs, conceptService) {
        try {
            const valueJSON = obs.valueJSON;
            if (!valueJSON) return null;

            const parsed = typeof valueJSON === 'string' ? JSON.parse(valueJSON) : valueJSON;

            // Coded answer — answer field is a UUID, resolve to concept name
            if (parsed.answer && typeof parsed.answer === 'string' &&
                parsed.answer.includes('-') && parsed.answer.length > 30) {
                // Looks like a UUID
                const answerConcept = conceptService.getConceptByUUID(parsed.answer);
                if (answerConcept) return answerConcept.name;
                return parsed.answer; // fallback to uuid if not found
            }

            // Numeric or text answer — answer field is the actual value
            if (parsed.answer !== undefined && parsed.answer !== null) {
                return String(parsed.answer);
            }

            // value field fallback
            if (parsed.value !== undefined && parsed.value !== null) {
                return String(parsed.value);
            }

            return null;
        } catch (e) {
            return null;
        }
    }

    loadConceptFilter(conceptName) {
        this.setState({ filterLoading: true, selectedConcept: conceptName });

        // Use setTimeout so loading state renders before heavy processing
        setTimeout(() => {
            try {
                const individualService = this.context.getService(IndividualService);
                const conceptService = this.context.getService(ConceptService);
                const allSubjects = individualService.findAll();

                const conceptMap = {};  // structureId -> answer text
                const answerSet = {};   // answer text -> true

                allSubjects.forEach(subject => {
                    if (!subject.firstName || !subject.observations) return;
                    const name = String(subject.firstName).trim();

                    let answerValue = null;
                    try {
                        for (let i = 0; i < subject.observations.length; i++) {
                            const obs = subject.observations[i];
                            if (obs.concept && obs.concept.name === conceptName) {
                                answerValue = this.resolveObsValue(obs, conceptService);
                                break;
                            }
                        }
                    } catch (e) {
                        // skip
                    }

                    if (answerValue) {
                        answerSet[answerValue] = true;
                        conceptMap[name] = answerValue;
                        const asInt = String(parseInt(name, 10));
                        if (asInt !== 'NaN') conceptMap[asInt] = answerValue;
                        conceptMap[name.padStart(4, '0')] = answerValue;
                    }
                });

                // Assign colors
                const conceptColors = {};
                const conceptLegend = [];
                Object.keys(answerSet).forEach((answer, index) => {
                    const color = COLOR_PALETTE[index % COLOR_PALETTE.length];
                    conceptColors[answer] = color;
                    conceptLegend.push({ answer, color });
                });

                this.setState({ conceptMap, conceptColors, conceptLegend, filterLoading: false }, () => {
                    if (this.webViewRef.current) {
                        this.webViewRef.current.postMessage(JSON.stringify({
                            type: 'updateConceptFilter',
                            conceptMap,
                            conceptColors,
                        }));
                    }
                });

            } catch (e) {
                alert('Filter error: ' + e.message);
                this.setState({ filterLoading: false });
            }
        }, 50);
    }

    clearConceptFilter() {
        this.setState({
            conceptMap: {},
            conceptColors: {},
            conceptLegend: [],
            selectedConcept: null,
            filterLoading: false,
        }, () => {
            if (this.webViewRef.current) {
                this.webViewRef.current.postMessage(JSON.stringify({
                    type: 'updateConceptFilter',
                    conceptMap: {},
                    conceptColors: {},
                }));
            }
        });
    }

    async loadLocalGeoJson() {
        try {
            const params = this.props.params || this.props;
            const avniUuid = params.avniUuid;
            const slumName = params.slumName;

            if (!avniUuid) {
                alert('No slum UUID received. Cannot load map.');
                this.goBack();
                return;
            }

            const path = `${GIS_DIR}/structures_${avniUuid}.json`;
            const exists = await RNFS.exists(path);
            if (!exists) {
                alert('No map data found. Please sync first.');
                this.goBack();
                return;
            }

            const raw = await RNFS.readFile(path, 'utf8');
            const data = JSON.parse(raw);
            const bbox = turf.bbox(data);
            const center = {
                lat: (bbox[1] + bbox[3]) / 2,
                lng: (bbox[0] + bbox[2]) / 2,
            };

            this.setState({ geojson: data, center, loading: false });
        } catch (e) {
            alert('Error loading map: ' + e.message);
            this.setState({ loading: false });
        }
    }

    goBack() {
        TypedTransition.from(this).goBack();
    }

    handleConfirm() {
        const { selected, selectedExistingUuid } = this.state;
        TypedTransition.from(this).goBack();
        setTimeout(() => {
            const CHSNavigator = require('../utility/CHSNavigator').default;
            CHSNavigator.invokeMapPickerCallback(selected, selectedExistingUuid);
        }, 300);
    }

    handleSearch() {
        const { searchText } = this.state;
        if (!searchText.trim()) return;
        const query = searchText.trim();
        const asInt = String(parseInt(query, 10));
        const padded = query.padStart(4, '0');
        if (this.webViewRef.current) {
            this.webViewRef.current.postMessage(JSON.stringify({
                type: 'searchStructure',
                variants: [query, asInt, padded],
            }));
        }
    }

    onWebViewMessage(event) {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'structureSelected') {
                const { statusMap } = this.state;
                const sid = String(data.structureId).trim();
                const entry = statusMap[sid]
                    || statusMap[String(parseInt(sid, 10))]
                    || statusMap[sid.padStart(4, '0')];
                this.setState({
                    selected: data.structureId,
                    selectedExistingUuid: entry ? entry.uuid : null,
                });
            } else if (data.type === 'searchNotFound') {
                alert('Structure not found on map');
            }
        } catch (e) {
            // ignore
        }
    }

    buildMapHTML() {
        const { geojson, center, statusMap, conceptMap, conceptColors } = this.state;
        const geojsonStr = JSON.stringify(geojson);
        const statusMapStr = JSON.stringify(statusMap);
        const conceptMapStr = JSON.stringify(conceptMap);
        const conceptColorsStr = JSON.stringify(conceptColors);

        return `<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body, #map { width:100%; height:100%; }
        .structure-label {
            background:transparent!important; border:none!important;
            box-shadow:none!important; font-size:9px; font-weight:bold;
            color:#fff; text-shadow:0 0 3px #000,0 0 3px #000;
            white-space:nowrap; pointer-events:none;
        }
    </style>
</head>
<body>
<div id="map"></div>
<script>
    var statusMap = ${statusMapStr};
    var conceptMap = ${conceptMapStr};
    var conceptColors = ${conceptColorsStr};
    var useConceptFilter = Object.keys(conceptMap).length > 0;

    var map = L.map('map').setView([${center.lat}, ${center.lng}], 17);
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        attribution:'Google Satellite', maxZoom:22
    }).addTo(map);

    var geojson = ${geojsonStr};
    var selectedLayer = null;
    var layerIndex = {};
    var labelLayers = [];

    function norm(sid) {
        sid = String(sid).trim();
        var asInt = String(parseInt(sid, 10));
        var padded = sid.length < 4 ? sid.padStart(4,'0') : sid;
        return [sid, asInt, padded];
    }

    function lookupStatus(sid) {
        var keys = norm(sid);
        for (var i=0; i<keys.length; i++) {
            if (statusMap[keys[i]]) return statusMap[keys[i]];
        }
        return null;
    }

    function lookupConcept(sid) {
        var keys = norm(sid);
        for (var i=0; i<keys.length; i++) {
            if (conceptMap[keys[i]]) return conceptMap[keys[i]];
        }
        return null;
    }

    function getStyle(structureId, isSelected, isSearch) {
        var sid = String(structureId).trim();
        if (isSearch)    return {fillColor:'#9B59B6', fillOpacity:0.9, color:'#6C3483', weight:3};
        if (isSelected)  return {fillColor:'#378ADD', fillOpacity:0.9, color:'#005BB5', weight:3};
        if (useConceptFilter) {
            var ans = lookupConcept(sid);
            if (ans && conceptColors[ans]) {
                return {fillColor:conceptColors[ans], fillOpacity:0.75, color:'#333', weight:1};
            }
            return {fillColor:'#bbb', fillOpacity:0.25, color:'#888', weight:1};
        }
        var entry = lookupStatus(sid);
        if (entry && entry.status === 'registered') {
            return {fillColor:'#ff8c00', fillOpacity:0.7, color:'#cc5500', weight:1};
        }
        return {fillColor:'#63991a', fillOpacity:0.4, color:'#2d6a0e', weight:1};
    }

    L.geoJSON(geojson, {
        style: function(f) { return getStyle(f.properties.s, false, false); },
        onEachFeature: function(feature, layer) {
            var sid = String(feature.properties.s).trim();
            var keys = norm(sid);
            keys.forEach(function(k) { layerIndex[k] = layer; });

            layer.on('click', function() {
                if (selectedLayer) {
                    selectedLayer.setStyle(getStyle(selectedLayer.feature.properties.s, false, false));
                }
                layer.setStyle(getStyle(sid, true, false));
                layer.bringToFront();
                selectedLayer = layer;
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type:'structureSelected', structureId:feature.properties.s
                }));
            });
        }
    }).addTo(map);

    function updateLabels() {
        labelLayers.forEach(function(l){ map.removeLayer(l); });
        labelLayers = [];
        if (map.getZoom() < 18) return;
        geojson.features.forEach(function(feature) {
            var coords = feature.geometry.coordinates[0];
            var latlngs = coords.map(function(c){ return [c[1],c[0]]; });
            var c = L.polygon(latlngs).getBounds().getCenter();
            var lbl = L.marker(c, {
                icon: L.divIcon({
                    className:'structure-label',
                    html: String(feature.properties.s),
                    iconSize:[40,12], iconAnchor:[20,6]
                }),
                interactive:false
            });
            lbl.addTo(map);
            labelLayers.push(lbl);
        });
    }
    map.on('zoomend', updateLabels);
    updateLabels();

    function refreshAll() {
        geojson.features.forEach(function(feature) {
            var sid = String(feature.properties.s).trim();
            var keys = norm(sid);
            var layer = layerIndex[keys[0]];
            if (!layer) return;
            var isSel = selectedLayer &&
                String(selectedLayer.feature.properties.s) === String(feature.properties.s);
            if (!isSel) layer.setStyle(getStyle(sid, false, false));
        });
    }

    function handleMessage(e) {
        try {
            var data = JSON.parse(e.data);

            if (data.type === 'searchStructure') {
                var found = null;
                for (var i=0; i<data.variants.length; i++) {
                    var key = String(data.variants[i]);
                    if (layerIndex[key]) { found = layerIndex[key]; break; }
                }
                if (found) {
                    if (selectedLayer) {
                        selectedLayer.setStyle(getStyle(selectedLayer.feature.properties.s, false, false));
                    }
                    found.setStyle(getStyle(found.feature.properties.s, false, true));
                    found.bringToFront();
                    selectedLayer = found;
                    map.fitBounds(found.getBounds(), {maxZoom:20, animate:true});
                    window.ReactNativeWebView.postMessage(JSON.stringify({
                        type:'structureSelected', structureId:found.feature.properties.s
                    }));
                } else {
                    window.ReactNativeWebView.postMessage(JSON.stringify({type:'searchNotFound'}));
                }
            }

            if (data.type === 'updateConceptFilter') {
                conceptMap = data.conceptMap;
                conceptColors = data.conceptColors;
                useConceptFilter = Object.keys(conceptMap).length > 0;
                refreshAll();
            }

        } catch(err) {}
    }
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);
</script>
</body>
</html>`;
    }

    renderFilterBar() {
        const { selectedConcept } = this.state;
        return (
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.filterScroll}
                contentContainerStyle={styles.filterContent}>
                <TouchableOpacity
                    style={[styles.filterChip, !selectedConcept && styles.filterChipActive]}
                    onPress={() => this.clearConceptFilter()}>
                    <Text style={[styles.filterChipText, !selectedConcept && styles.filterChipTextActive]}>
                        Survey Status
                    </Text>
                </TouchableOpacity>
                {FILTER_CONCEPTS.map((concept, i) => (
                    <TouchableOpacity
                        key={i}
                        style={[styles.filterChip, selectedConcept === concept && styles.filterChipActive]}
                        onPress={() => this.loadConceptFilter(concept)}>
                        <Text style={[styles.filterChipText, selectedConcept === concept && styles.filterChipTextActive]}>
                            {FILTER_LABELS[concept] || concept}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        );
    }

    renderLegend() {
        const { selectedConcept, conceptLegend } = this.state;
        if (selectedConcept && conceptLegend.length > 0) {
            return (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.legendScroll}
                    contentContainerStyle={styles.legendContent}>
                    {conceptLegend.map((item, i) => (
                        <View key={i} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                            <Text style={styles.legendText}>{item.answer}</Text>
                        </View>
                    ))}
                    <View style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: '#bbb' }]} />
                        <Text style={styles.legendText}>No data</Text>
                    </View>
                </ScrollView>
            );
        }
        // Default legend
        return (
            <View style={styles.legendScroll}>
                <View style={styles.legendContent}>
                    {[
                        { color: '#63991a', label: 'Not surveyed' },
                        { color: '#ff8c00', label: 'Registered' },
                        { color: '#378ADD', label: 'Selected' },
                        { color: '#9B59B6', label: 'Search result' },
                    ].map((item, i) => (
                        <View key={i} style={styles.legendItem}>
                            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                            <Text style={styles.legendText}>{item.label}</Text>
                        </View>
                    ))}
                </View>
            </View>
        );
    }

    render() {
        const { loading, filterLoading, selected, selectedExistingUuid, geojson, center, searchText } = this.state;
        const params = this.props.params || this.props;
        const slumName = params.slumName;

        if (loading) {
            return (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color="#1D9E75" />
                    <Text style={styles.loadingText}>Loading map...</Text>
                </View>
            );
        }

        return (
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => this.goBack()}>
                        <Text style={styles.backBtn}>← Back</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>{slumName || 'Select Structure'}</Text>
                </View>

                {/* Search bar */}
                <View style={styles.searchBar}>
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search structure no. (e.g. 1 or 0001)"
                        placeholderTextColor="#999"
                        value={searchText}
                        onChangeText={(text) => this.setState({ searchText: text })}
                        keyboardType="numeric"
                        returnKeyType="search"
                        onSubmitEditing={() => this.handleSearch()}
                    />
                    <TouchableOpacity style={styles.searchBtn} onPress={() => this.handleSearch()}>
                        <Text style={styles.searchBtnText}>🔍</Text>
                    </TouchableOpacity>
                </View>

                {/* Scrollable filter chips */}
                {this.renderFilterBar()}

                {/* Legend */}
                {this.renderLegend()}

                {/* Map */}
                <View style={styles.mapContainer}>
                    {geojson && center && (
                        <WebView
                            ref={this.webViewRef}
                            style={styles.map}
                            source={{ html: this.buildMapHTML() }}
                            onMessage={(event) => this.onWebViewMessage(event)}
                            javaScriptEnabled={true}
                            domStorageEnabled={true}
                            originWhitelist={['*']}
                        />
                    )}

                    {/* Filter loading overlay */}
                    {filterLoading && (
                        <View style={styles.filterLoadingOverlay}>
                            <View style={styles.filterLoadingBox}>
                                <ActivityIndicator size="large" color="#1D9E75" />
                                <Text style={styles.filterLoadingText}>Applying filter...</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Bottom bar */}
                {selected ? (
                    <View style={styles.confirmBar}>
                        <View>
                            <Text style={styles.confirmLabel}>
                                {selectedExistingUuid ? 'Already Registered' : 'Selected Structure'}
                            </Text>
                            <Text style={styles.confirmId}>#{selected}</Text>
                        </View>
                        <TouchableOpacity
                            style={[styles.confirmBtn, selectedExistingUuid && styles.confirmBtnExisting]}
                            onPress={() => this.handleConfirm()}>
                            <Text style={styles.confirmBtnText}>
                                {selectedExistingUuid ? 'View Household →' : 'Use this →'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.hintBar}>
                        <Text style={styles.hintText}>Tap a structure on the map to select it</Text>
                    </View>
                )}
            </View>
        );
    }
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 16, color: '#555' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1D9E75',
        paddingHorizontal: 16,
        paddingVertical: 12,
        paddingTop: 40,
        gap: 12,
    },
    backBtn: { color: '#fff', fontSize: 16 },
    headerTitle: { color: '#fff', fontSize: 16, fontWeight: '500' },
    searchBar: {
        flexDirection: 'row',
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#e0e0e0',
        alignItems: 'center',
        gap: 8,
    },
    searchInput: {
        flex: 1,
        height: 36,
        backgroundColor: '#f4f4f4',
        borderRadius: 8,
        paddingHorizontal: 12,
        fontSize: 14,
        color: '#333',
    },
    searchBtn: {
        backgroundColor: '#1D9E75',
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 8,
    },
    searchBtnText: { fontSize: 16 },
    filterScroll: {
        backgroundColor: '#f0f0f0',
        borderBottomWidth: 1,
        borderBottomColor: '#ddd',
        maxHeight: 44,
    },
    filterContent: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 6,
        flexDirection: 'row',
        alignItems: 'center',
    },
    filterChip: {
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 16,
        backgroundColor: '#ddd',
        marginRight: 6,
    },
    filterChipActive: { backgroundColor: '#1D9E75' },
    filterChipText: { fontSize: 12, color: '#444' },
    filterChipTextActive: { color: '#fff', fontWeight: '500' },
    legendScroll: {
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        maxHeight: 34,
    },
    legendContent: {
        flexDirection: 'row',
        paddingHorizontal: 10,
        paddingVertical: 6,
        gap: 12,
        alignItems: 'center',
    },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot: { width: 12, height: 12, borderRadius: 3 },
    legendText: { fontSize: 11, color: '#444' },
    mapContainer: { flex: 1, position: 'relative' },
    map: { flex: 1 },
    filterLoadingOverlay: {
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.45)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    filterLoadingBox: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 24,
        alignItems: 'center',
        gap: 12,
    },
    filterLoadingText: { fontSize: 15, color: '#333', marginTop: 8 },
    confirmBar: {
        backgroundColor: '#fff',
        padding: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    confirmLabel: { fontSize: 12, color: '#888' },
    confirmId: { fontSize: 18, fontWeight: '500', color: '#1D9E75' },
    confirmBtn: {
        backgroundColor: '#1D9E75',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    confirmBtnExisting: { backgroundColor: '#ff8c00' },
    confirmBtnText: { color: '#fff', fontWeight: '500', fontSize: 15 },
    hintBar: {
        backgroundColor: '#fff',
        padding: 16,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    hintText: { color: '#888', fontSize: 14 },
});

export default MapPickerScreen;