import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, ScrollView, Modal } from 'react-native';
import { WebView } from 'react-native-webview';
import * as turf from '@turf/turf';
import RNFS from 'react-native-fs';
import _ from 'lodash';
import { SubjectType } from 'avni-models';
import AbstractComponent from '../framework/view/AbstractComponent';
import Path from '../framework/routing/Path';
import TypedTransition from '../framework/routing/TypedTransition';
import General from '../utility/General';
import IndividualService from '../service/IndividualService';
import ConceptService from '../service/ConceptService';
import EntityService from '../service/EntityService';
import FormMappingService from '../service/FormMappingService';
import PrivilegeService from '../service/PrivilegeService';
import { structureKey, STRUCTURE_KEY_SOURCE } from '../gis/structureNumber';
import { STATUS_COLORS, ANSWER_STYLE, statusLegend, answerLegend } from '../gis/colorCoding';
import {
    STATUS, buildStatusMap, buildFilterCatalog, applyFilter, canViewSubjectType, codedConceptsOnForm,
} from '../gis/mapData';

const GIS_DIR = `${RNFS.DocumentDirectoryPath}/gis`;

// Satellite map of one slum's building footprints. The worker taps the house
// they are at; the structure number (or the already-registered household)
// goes back to RegisterView through CHSNavigator.invokeMapPickerCallback.
//
// Colours, the survey-status map and the filter list all come from src/gis:
// colorCoding.js (every colour, also injected into the Leaflet page below),
// mapData.js (status/duplicates, which filters this slum and user get, and
// the answer map of the active filter).
@Path('/mapPickerScreen')
class MapPickerScreen extends AbstractComponent {

    constructor(props, context) {
        super(props, context);
        const params = props.params || props;
        // Every Slum the worker has synced (their catchment); the picker starts on params.avniUuid.
        const slums = params.slums && params.slums.length > 0
            ? params.slums
            : [{ uuid: params.avniUuid, name: params.slumName }];
        const current = slums.find(s => s.uuid === params.avniUuid) || slums[0];
        this.state = {
            slums,
            avniUuid: current.uuid,
            slumName: current.name,
            subjectTypeName: params.subjectTypeName,
            slumPickerOpen: false,
            duplicatePickerOpen: false,
            geojson: null,
            center: null,
            loading: true,
            filterLoading: false,
            selected: null,          // structure number tapped on the map
            selectedEntry: null,     // statusMap entry for it, or null when nobody is registered there
            statusMap: {},           // structureKey -> {status, uuids, count}
            filters: [],             // what the filter bar offers for this slum/user (mapData.buildFilterCatalog)
            activeFilter: null,
            answerByKey: {},         // structureKey -> answer label for the active filter
            answerColors: {},        // answer label -> colour; the legend is rendered from this
            searchText: '',
        };
        this.webViewRef = React.createRef();
    }

    viewName() {
        return 'MapPickerScreen';
    }

    componentDidMount() {
        this.loadLocalGeoJson();
        this.loadSlumData();
    }

    // House numbers are only unique within a slum, so everything is built from the households of
    // this subject type registered in the slum on screen (voided excluded).
    subjectsInCurrentSlum() {
        const { avniUuid, subjectTypeName } = this.state;
        const criteria = [`voided = false`, `lowestAddressLevel.uuid = "${avniUuid}"`];
        if (subjectTypeName) criteria.push(`subjectType.name = "${subjectTypeName}"`);
        return this.context.getService(IndividualService).findAllByCriteria(criteria.join(' AND '));
    }

    // Status map + the filters that make sense here: coded questions of this subject type's
    // registration form that at least one household in this slum answered, shown only when the
    // user's groups may view the subject type; plus a duplicates filter when any exist.
    loadSlumData() {
        try {
            const subjects = this.subjectsInCurrentSlum();
            const statusMap = buildStatusMap(subjects);
            const { subjectTypeName } = this.state;
            const subjectType = subjectTypeName
                ? this.context.getService(EntityService).findByKey('name', subjectTypeName, SubjectType.schema.name)
                : null;
            const form = subjectType ? this.context.getService(FormMappingService).findRegistrationForm(subjectType) : null;
            const canViewAnswers = subjectType ? canViewSubjectType(this.context.getService(PrivilegeService), subjectType) : false;
            const filters = buildFilterCatalog({
                concepts: codedConceptsOnForm(form),
                subjects,
                conceptService: this.context.getService(ConceptService),
                statusMap,
                canViewAnswers,
            });
            this.setState({ statusMap, filters });
        } catch (e) {
            General.logError('MapPickerScreen', e);
            this.setState({ statusMap: {}, filters: [] });
        }
    }

    switchSlum(slum) {
        if (slum.uuid === this.state.avniUuid) {
            this.setState({ slumPickerOpen: false });
            return;
        }
        this.setState({
            avniUuid: slum.uuid,
            slumName: slum.name,
            slumPickerOpen: false,
            duplicatePickerOpen: false,
            loading: true,
            geojson: null,
            center: null,
            selected: null,
            selectedEntry: null,
            searchText: '',
            statusMap: {},
            filters: [],
            activeFilter: null,
            answerByKey: {},
            answerColors: {},
        }, () => {
            this.loadLocalGeoJson();
            this.loadSlumData();
        });
    }

    selectFilter(filter) {
        if (!filter) {
            this.pushFilter(null, {}, {});
            return;
        }
        this.setState({ filterLoading: true, activeFilter: filter.key });
        // Let the loading overlay paint before walking every household.
        setTimeout(() => {
            try {
                const { answerByKey, answerColors } = applyFilter(filter, {
                    subjects: this.subjectsInCurrentSlum(),
                    conceptService: this.context.getService(ConceptService),
                    statusMap: this.state.statusMap,
                });
                this.pushFilter(filter.key, answerByKey, answerColors);
            } catch (e) {
                General.logError('MapPickerScreen', e);
                this.pushFilter(null, {}, {});
            }
        }, 50);
    }

    pushFilter(activeFilter, answerByKey, answerColors) {
        this.setState({ activeFilter, answerByKey, answerColors, filterLoading: false }, () => {
            if (this.webViewRef.current) {
                this.webViewRef.current.postMessage(JSON.stringify({ type: 'updateFilter', answerByKey, answerColors }));
            }
        });
    }

    async loadLocalGeoJson() {
        try {
            const { avniUuid } = this.state;
            if (!avniUuid) {
                alert('No slum UUID received. Cannot load map.');
                this.goBack();
                return;
            }
            const path = `${GIS_DIR}/structures_${avniUuid}.json`;
            if (!(await RNFS.exists(path))) {
                alert(`No map data for ${this.state.slumName}. Please sync first.`);
                if (this.state.slums.length > 1) {
                    this.setState({ loading: false, slumPickerOpen: true });
                } else {
                    this.goBack();
                }
                return;
            }
            const data = JSON.parse(await RNFS.readFile(path, 'utf8'));
            const bbox = turf.bbox(data);
            const center = { lat: (bbox[1] + bbox[3]) / 2, lng: (bbox[0] + bbox[2]) / 2 };
            this.setState({ geojson: data, center, loading: false });
        } catch (e) {
            alert('Error loading map: ' + e.message);
            this.setState({ loading: false });
        }
    }

    goBack() {
        TypedTransition.from(this).goBack();
    }

    // existingUuid: the household to open (chosen from the duplicate list when there are several).
    handleConfirm(existingUuid) {
        const { selected, selectedEntry, avniUuid } = this.state;
        const uuid = existingUuid || (selectedEntry ? selectedEntry.uuids[0] : null);
        TypedTransition.from(this).goBack();
        setTimeout(() => {
            const CHSNavigator = require('../utility/CHSNavigator').default;
            CHSNavigator.invokeMapPickerCallback(selected, uuid, avniUuid);
        }, 300);
    }

    onConfirmPressed() {
        const { selectedEntry } = this.state;
        if (selectedEntry && selectedEntry.count > 1) {
            this.setState({ duplicatePickerOpen: true });
        } else {
            this.handleConfirm();
        }
    }

    handleSearch() {
        const key = structureKey(this.state.searchText);
        if (!key) return;
        if (this.webViewRef.current) {
            this.webViewRef.current.postMessage(JSON.stringify({ type: 'searchStructure', key }));
        }
    }

    onWebViewMessage(event) {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'structureSelected') {
                this.setState({
                    selected: data.structureId,
                    selectedEntry: this.state.statusMap[structureKey(data.structureId)] || null,
                });
            } else if (data.type === 'searchNotFound') {
                alert('Structure not found on map');
            }
        } catch (e) {
            // ignore malformed messages from the page
        }
    }

    buildMapHTML() {
        const { geojson, center, statusMap, answerByKey, answerColors } = this.state;
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
    // All colours come from src/gis/colorCoding.js — nothing is hardcoded here.
    var STATUS_COLORS = ${JSON.stringify(STATUS_COLORS)};
    var ANSWER_STYLE = ${JSON.stringify(ANSWER_STYLE)};
    var statusMap = ${JSON.stringify(statusMap)};
    var answerByKey = ${JSON.stringify(answerByKey)};
    var answerColors = ${JSON.stringify(answerColors)};
    var filterActive = Object.keys(answerByKey).length > 0;

    var map = L.map('map').setView([${center.lat}, ${center.lng}], 17);
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        attribution:'Google Satellite', maxZoom:22
    }).addTo(map);

    var geojson = ${JSON.stringify(geojson)};
    var selectedLayer = null;
    var layerIndex = {};
    var labelLayers = [];

    // Same implementation as the React Native side (src/gis/structureNumber.js).
    ${STRUCTURE_KEY_SOURCE}

    function statusStyle(entry) {
        return {fillColor: entry.fill, fillOpacity: entry.fillOpacity, color: entry.stroke, weight: entry.weight};
    }

    function getStyle(structureId, isSelected, isSearch) {
        var key = structureKey(structureId);
        if (isSearch)   return statusStyle(STATUS_COLORS.searchHit);
        if (isSelected) return statusStyle(STATUS_COLORS.selected);
        if (filterActive) {
            var answer = answerByKey[key];
            if (answer && answerColors[answer]) {
                return {fillColor: answerColors[answer], fillOpacity: ANSWER_STYLE.fillOpacity, color: ANSWER_STYLE.stroke, weight: ANSWER_STYLE.weight};
            }
            return statusStyle(statusMap[key] ? STATUS_COLORS.noData : STATUS_COLORS.filteredOut);
        }
        var entry = statusMap[key];
        if (entry && entry.status === '${STATUS.duplicate}') return statusStyle(STATUS_COLORS.duplicate);
        if (entry) return statusStyle(STATUS_COLORS.registered);
        return statusStyle(STATUS_COLORS.notSurveyed);
    }

    L.geoJSON(geojson, {
        style: function(f) { return getStyle(f.properties.s, false, false); },
        onEachFeature: function(feature, layer) {
            var sid = String(feature.properties.s).trim();
            layerIndex[structureKey(sid)] = layer;
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
            var layer = layerIndex[structureKey(sid)];
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
                var found = layerIndex[structureKey(data.key)] || null;
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
            if (data.type === 'updateFilter') {
                answerByKey = data.answerByKey;
                answerColors = data.answerColors;
                filterActive = Object.keys(answerByKey).length > 0;
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

    renderPicker({ visible, title, rows, onClose }) {
        if (!visible) return null;
        return (
            <Modal transparent animationType="fade" onRequestClose={onClose}>
                <TouchableOpacity style={styles.pickerBackdrop} activeOpacity={1} onPress={onClose}>
                    <View style={styles.pickerSheet}>
                        <Text style={styles.pickerTitle}>{title}</Text>
                        <ScrollView>
                            {rows.map(row => (
                                <TouchableOpacity key={row.key} style={styles.pickerRow} onPress={row.onPress}>
                                    <Text style={[styles.pickerText, row.active && styles.pickerTextActive]}>{row.label}</Text>
                                    {row.subLabel ? <Text style={styles.pickerSubText}>{row.subLabel}</Text> : null}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </TouchableOpacity>
            </Modal>
        );
    }

    renderSlumPicker() {
        const { slums, slumPickerOpen, avniUuid } = this.state;
        return this.renderPicker({
            visible: slumPickerOpen,
            title: 'Choose a slum',
            onClose: () => this.setState({ slumPickerOpen: false }),
            rows: slums.map(slum => ({ key: slum.uuid, label: slum.name, active: slum.uuid === avniUuid, onPress: () => this.switchSlum(slum) })),
        });
    }

    // Several households are registered on the tapped structure: let the worker choose which to open.
    renderDuplicatePicker() {
        const { duplicatePickerOpen, selectedEntry, selected } = this.state;
        if (!duplicatePickerOpen || !selectedEntry) return null;
        const individualService = this.context.getService(IndividualService);
        const rows = selectedEntry.uuids.map((uuid, i) => {
            const subject = individualService.findByUUID(uuid);
            const registered = subject && subject.registrationDate ? General.formatDate(subject.registrationDate) : '';
            return {
                key: uuid,
                label: `${i + 1}. ${subject ? subject.nameString : uuid}`,
                subLabel: registered ? `Registered ${registered}` : null,
                onPress: () => { this.setState({ duplicatePickerOpen: false }); this.handleConfirm(uuid); },
            };
        });
        return this.renderPicker({
            visible: true,
            title: `#${selected} — ${selectedEntry.count} households registered`,
            onClose: () => this.setState({ duplicatePickerOpen: false }),
            rows,
        });
    }

    renderFilterBar() {
        const { filters, activeFilter } = this.state;
        const chip = (key, label, onPress, active) => (
            <TouchableOpacity key={key} style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}>
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
        );
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
                {chip('__status__', 'Survey Status', () => this.selectFilter(null), !activeFilter)}
                {filters.map(filter => chip(filter.key, `${filter.label} (${filter.count})`, () => this.selectFilter(filter), activeFilter === filter.key))}
            </ScrollView>
        );
    }

    // Always derived from what the active filter actually computed (answerColors) or the status set.
    renderLegend() {
        const { activeFilter, answerColors, statusMap } = this.state;
        const rows = activeFilter
            ? answerLegend(answerColors)
            : statusLegend({ includeDuplicate: _.some(statusMap, entry => entry.status === STATUS.duplicate) });
        return (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.legendScroll} contentContainerStyle={styles.legendContent}>
                {rows.map(row => (
                    <View key={row.key} style={styles.legendItem}>
                        <View style={[styles.legendDot, { backgroundColor: row.color }]} />
                        <Text style={styles.legendText}>{row.label}</Text>
                    </View>
                ))}
            </ScrollView>
        );
    }

    renderBottomBar() {
        const { selected, selectedEntry } = this.state;
        if (!selected) {
            return (
                <View style={styles.hintBar}>
                    <Text style={styles.hintText}>Tap a structure on the map to select it</Text>
                </View>
            );
        }
        const isDuplicate = selectedEntry && selectedEntry.count > 1;
        const label = isDuplicate ? `${selectedEntry.count} households registered here`
            : selectedEntry ? 'Already registered' : 'Selected structure';
        const button = isDuplicate ? 'View households →' : selectedEntry ? 'View household →' : 'Use this →';
        return (
            <View style={styles.confirmBar}>
                <View>
                    <Text style={styles.confirmLabel}>{label}</Text>
                    <Text style={styles.confirmId}>#{selected}</Text>
                </View>
                <TouchableOpacity
                    style={[styles.confirmBtn, selectedEntry && styles.confirmBtnExisting, isDuplicate && styles.confirmBtnDuplicate]}
                    onPress={() => this.onConfirmPressed()}>
                    <Text style={styles.confirmBtnText}>{button}</Text>
                </TouchableOpacity>
            </View>
        );
    }

    render() {
        const { loading, filterLoading, geojson, center, searchText, slumName, slums } = this.state;
        const canSwitchSlum = slums.length > 1;

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
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => this.goBack()}>
                        <Text style={styles.backBtn}>← Back</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.headerTitleTouch} disabled={!canSwitchSlum}
                        onPress={() => this.setState({ slumPickerOpen: true })}>
                        <Text style={styles.headerTitle} numberOfLines={1}>
                            {slumName || 'Select Structure'}{canSwitchSlum ? '  ▾' : ''}
                        </Text>
                    </TouchableOpacity>
                </View>

                {this.renderSlumPicker()}
                {this.renderDuplicatePicker()}

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

                {this.renderFilterBar()}
                {this.renderLegend()}

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
                    {filterLoading && (
                        <View style={styles.filterLoadingOverlay}>
                            <View style={styles.filterLoadingBox}>
                                <ActivityIndicator size="large" color="#1D9E75" />
                                <Text style={styles.filterLoadingText}>Applying filter...</Text>
                            </View>
                        </View>
                    )}
                </View>

                {this.renderBottomBar()}
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
    confirmBtnExisting: { backgroundColor: STATUS_COLORS.registered.fill },
    confirmBtnDuplicate: { backgroundColor: STATUS_COLORS.duplicate.fill },
    confirmBtnText: { color: '#fff', fontWeight: '500', fontSize: 15 },
    hintBar: {
        backgroundColor: '#fff',
        padding: 16,
        alignItems: 'center',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
    },
    hintText: { color: '#888', fontSize: 14 },
    pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    pickerSheet: { backgroundColor: '#fff', borderRadius: 8, maxHeight: '70%', paddingVertical: 8 },
    pickerTitle: { fontSize: 16, fontWeight: '600', color: '#333', paddingHorizontal: 16, paddingVertical: 8 },
    pickerRow: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#eee' },
    pickerText: { fontSize: 16, color: '#333' },
    pickerTextActive: { color: '#1D9E75', fontWeight: '600' },
    pickerSubText: { fontSize: 12, color: '#888', marginTop: 2 },
    headerTitleTouch: { flex: 1 },
});

export default MapPickerScreen;
