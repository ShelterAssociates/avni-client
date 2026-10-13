import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, TextInput, ScrollView, Modal, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import DropDownPicker from 'react-native-dropdown-picker';
import AppHeader from './common/AppHeader';
import CHSContainer from './common/CHSContainer';
import AvniIcon from './common/AvniIcon';
import Colors from './primitives/Colors';
import RNFS from 'react-native-fs';
import _ from 'lodash';
import { Form, SubjectType } from 'avni-models';
import AbstractComponent from '../framework/view/AbstractComponent';
import Path from '../framework/routing/Path';
import TypedTransition from '../framework/routing/TypedTransition';
import General from '../utility/General';
import Perf from '../utility/perf';
import IndividualService from '../service/IndividualService';
import ConceptService from '../service/ConceptService';
import EntityService from '../service/EntityService';
import FormMappingService from '../service/FormMappingService';
import PrivilegeService from '../service/PrivilegeService';
import ProgramService from '../service/program/ProgramService';
import EncounterTypeService from '../service/EncounterTypeService';
import EntityQueueService from '../service/EntityQueueService';
import EntitySyncStatusService from '../service/EntitySyncStatusService';
import GisSyncService from '../service/GisSyncService';
import NoStructures from './gis/NoStructures';
import { structureKey, STRUCTURE_KEY_SOURCE } from '../gis/structureNumber';
import { STATUS_COLORS, ANSWER_STYLE, BOUNDARY_STYLE, DUPLICATE_STRIPES, statusLegend, answerLegend } from '../gis/colorCoding';
import { hasStructures, mapCenter } from '../gis/mapCenter';
import { EXTRA_BLANK, EXTRA_ON_MAP, EXTRA_TAKEN, extraHouseholds, validateExtraHouse } from '../gis/extraHouseholds';
import { householdSummary, recentHouseholds } from '../gis/householdSummary';
import {
    STATUS, buildStatusMap, buildFilterCatalog, applyFilter, canViewSubjectType, codedConceptsOnForms,
} from '../gis/mapData';

const STATUS_FILTER = '__status__';
const EXTRA_MESSAGES = {
    [EXTRA_BLANK]: 'Type a house number.',
    [EXTRA_ON_MAP]: 'That house is on the map — pick it there instead.',
    [EXTRA_TAKEN]: 'A household is already registered on that number.',
};
const TOGGLABLE_STATUSES = ['notSurveyed', 'registered', 'duplicate'];  // selected/search are interaction states

// Filter lists per slum for this session, keyed by what they were built from.
const filterCatalogs = {};

// Sync renames the slum file aside while it writes the new one, so a stat can always lose the race.
async function fileMtime(path) {
    try {
        return String((await RNFS.stat(path)).mtime);
    } catch (e) {
        return null;
    }
}

// Parsed slum files for this session, keyed by path and invalidated when sync rewrites the file.
const slumFiles = {};
async function readSlumFile(path, mtime) {
    const t0 = Date.now();
    const cached = slumFiles[path];
    if (cached && cached.mtime === mtime) return cached.data;
    const text = await RNFS.readFile(path, 'utf8');
    const data = Perf.time('map.parseGeojson', () => JSON.parse(text), {bytes: text.length});
    Perf.mark('map.readGeojson', {ms: Date.now() - t0});
    Object.keys(slumFiles).forEach(key => delete slumFiles[key]);  // one slum in memory is enough on small phones
    slumFiles[path] = { mtime, data };
    return data;
}

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
        this.openedAt = params.openedAt || Date.now();
        this.state = {
            slums,
            avniUuid: current.uuid,
            slumName: current.name,
            subjectTypeName: params.subjectTypeName,
            browse: params.mode === 'browse',
            slumPickerOpen: false,
            filterOpen: false,
            showLabels: false,
            showAllLabels: false,
            notice: null,            // one-line warning shown under the header
            duplicatePickerOpen: false,
            extraMenuOpen: false,
            extraListOpen: false,
            extraPromptOpen: false,
            extraNumber: '',
            extraError: null,
            geojson: null,
            center: null,
            noStructures: false,     // the latest sync brought none: NoStructures stands in for the map
            noStructuresMessage: '',
            recent: [],              // newest registrations of this slum, listed on that screen
            loading: true,
            filterLoading: false,
            selected: null,          // structure number tapped on the map
            selectedEntry: null,     // statusMap entry for it, or null when nobody is registered there
            household: null,         // householdSummary of the single household registered there
            statusMap: {},           // structureKey -> {status, uuids, count}
            filters: [],             // what the filter bar offers for this slum/user (mapData.buildFilterCatalog)
            table: [],               // each household's raw answers, so filters apply without touching Realm
            activeFilter: null,
            answerByKey: {},         // structureKey -> answer label for the active filter
            answerColors: {},        // answer label -> colour; the legend is rendered from this
            hiddenAnswers: [],       // legend rows unticked for the active filter
            hiddenStatuses: [],      // legend rows unticked in the survey-status view
            searchText: '',
        };
        this.webViewRef = React.createRef();
    }

    viewName() {
        return 'MapPickerScreen';
    }

    componentDidMount() {
        Perf.mark('map.mounted', {sinceOpen: Date.now() - this.openedAt});
        this.loadLocalGeoJson();
    }

    componentWillUnmount() {
        require('../utility/CHSNavigator').default.clearMapPickerCallback();
        super.componentWillUnmount();
    }

    // Coming back from a registration: the map is still mounted, so re-read what is registered now.
    didFocus() {
        super.didFocus();
        if (!this.focusedOnce) {
            this.focusedOnce = true;
            return;
        }
        this.reloadIfFileChanged();
    }

    // A sync that ran while this screen was open has rewritten the slum file; the map must draw the
    // structures of the latest sync, not the ones it was opened with.
    async reloadIfFileChanged() {
        const mtime = await fileMtime(GisSyncService.slumFilePath(this.state.avniUuid));
        if (mtime !== this.loadedMtime) {
            this.setState({ loading: true }, () => this.loadLocalGeoJson());
        } else if (this.state.geojson) {
            this.refreshStatus();
        } else if (this.state.noStructures) {
            this.showNoStructures(this.state.noStructuresMessage);
        }
    }

    refreshStatus() {
        const subjects = this.subjectsInCurrentSlum();
        const statusMap = Perf.time('map.refreshStatus', () => buildStatusMap(subjects));
        // Keep the cached page keyed to the new map so render does not rebuild the WebView and lose the view.
        if (this.html) this.html.statusMap = statusMap;
        const selectedEntry = this.state.selected ? statusMap[structureKey(this.state.selected)] || null : null;
        this.setState({ statusMap, selectedEntry, household: this.summarise(selectedEntry) }, () => {
            this.post({ type: 'updateStatus', statusMap });
            this.refreshFilters(subjects, statusMap);
        });
    }

    // A household registered just now also changes the filter counts and its own answers.
    async refreshFilters(subjects, statusMap) {
        const active = this.state.activeFilter;
        const catalog = await this.loadFilters(subjects, statusMap);
        if (!catalog || !active || active === STATUS_FILTER) return;
        const filter = _.find(catalog.filters, { key: active });
        if (filter) this.selectFilter(filter);
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
    // Registration, enrolment and visit forms the user may see for this subject type: their coded questions are the filters.
    viewableForms(subjectType) {
        const formMappingService = this.context.getService(FormMappingService);
        const programs = this.context.getService(ProgramService).getAllowedViewPrograms([subjectType]);
        const encounterTypes = this.context.getService(EncounterTypeService).getAllowedViewEncounterTypes([subjectType], programs);
        return {
            registration: formMappingService.findRegistrationForm(subjectType),
            others: [
                ...programs.map(program => formMappingService.findFormForProgramEnrolment(program, subjectType)),
                ...encounterTypes.map(encounterType => formMappingService.findFormForEncounterType(encounterType,
                    formMappingService.findProgramUUIDForEncounterType(encounterType, subjectType) ? Form.formTypes.ProgramEncounter : Form.formTypes.Encounter, subjectType)),
            ],
        };
    }

    // The map needs only the status map; the filter list is heavier and fills in once the map is on screen.
    loadSlumData() {
        try {
            const subjects = Perf.time('map.subjects', () => this.subjectsInCurrentSlum());
            const statusMap = Perf.time('map.statusMap', () => buildStatusMap(subjects), {subjects: subjects.length});
            this.setState({ statusMap, loading: false }, () => setTimeout(() => this.loadFilters(subjects, statusMap), 0));
        } catch (e) {
            General.logError('MapPickerScreen', e);
            this.setState({ statusMap: {}, filters: [], loading: false });
        }
    }

    async loadFilters(subjects, statusMap) {
        const { avniUuid, subjectTypeName } = this.state;
        // Local edits grow the upload queue and a sync moves the last-loaded time, so either change rebuilds the list.
        const cacheKey = [avniUuid, subjectTypeName, subjects.length, this.context.getService(EntityQueueService).getTotalQueueCount(),
            this.context.getService(EntitySyncStatusService).getLastLoaded()].join('|');
        if (filterCatalogs[cacheKey]) {
            this.setState(filterCatalogs[cacheKey]);
            return filterCatalogs[cacheKey];
        }
        try {
            const t0 = Date.now();
            const subjectType = subjectTypeName
                ? this.context.getService(EntityService).findByKey('name', subjectTypeName, SubjectType.schema.name)
                : null;
            const canViewAnswers = subjectType ? canViewSubjectType(this.context.getService(PrivilegeService), subjectType) : false;
            const forms = subjectType ? this.viewableForms(subjectType) : { registration: null, others: [] };
            const registrationConcepts = codedConceptsOnForms([forms.registration]);
            const catalog = await buildFilterCatalog({
                concepts: codedConceptsOnForms([forms.registration, ...forms.others]),
                registrationConcepts,
                subjects,
                statusMap,
                canViewAnswers,
                mapFilters: _.get(this.state.geojson, 'map_filters', []),
            });
            Perf.mark('map.filterCatalog', {ms: Date.now() - t0, filters: catalog.filters.length});
            filterCatalogs[cacheKey] = catalog;
            if (this.state.avniUuid === avniUuid) this.setState(catalog);
            return catalog;
        } catch (e) {
            General.logError('MapPickerScreen', e);
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
            household: null,
            searchText: '',
            statusMap: {},
            filters: [],
            table: [],
            hiddenStatuses: [],
            activeFilter: null,
            answerByKey: {},
            answerColors: {},
        }, () => this.loadLocalGeoJson());
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
                const { answerByKey, answerColors } = Perf.time('map.applyFilter', () => applyFilter(filter, {
                    table: this.state.table,
                    conceptService: this.context.getService(ConceptService),
                    statusMap: this.state.statusMap,
                    filterStyles: _.get(this.state.geojson, 'filters', []),
                }));
                this.pushFilter(filter.key, answerByKey, answerColors);
            } catch (e) {
                General.logError('MapPickerScreen', e);
                this.pushFilter(null, {}, {});
            }
        }, 50);
    }

    pushFilter(activeFilter, answerByKey, answerColors, hiddenAnswers = []) {
        this.setState({ activeFilter, answerByKey, answerColors, hiddenAnswers, filterLoading: false }, () => {
            this.post({ type: 'updateFilter', answerByKey, answerColors, hiddenAnswers });
        });
    }

    toggleLegendRow(key) {
        const { activeFilter, answerByKey, answerColors, hiddenAnswers, hiddenStatuses } = this.state;
        if (activeFilter) {
            this.pushFilter(activeFilter, answerByKey, answerColors, _.xor(hiddenAnswers, [key]));
        } else {
            const next = _.xor(hiddenStatuses, [key]);
            this.setState({ hiddenStatuses: next });
            this.post({ type: 'hideStatuses', hiddenStatuses: next });
        }
    }

    async loadLocalGeoJson() {
        try {
            const { avniUuid } = this.state;
            if (!avniUuid) {
                alert('No slum UUID received. Cannot load map.');
                this.goBack();
                return;
            }
            const path = GisSyncService.slumFilePath(avniUuid);
            const mtime = await fileMtime(path);
            this.loadedMtime = mtime;
            if (mtime === null) {
                this.showNoStructures(`No map data for ${this.state.slumName} yet. Sync to download its structures.`);
                return;
            }
            const data = await readSlumFile(path, mtime);
            const center = hasStructures(data) ? mapCenter(data) : null;
            if (!center) {
                this.showNoStructures(`The latest sync brought no structures for ${this.state.slumName}.`);
                return;
            }
            this.setState({ geojson: data, center, notice: null, noStructures: false }, () => this.loadSlumData());
        } catch (e) {
            alert('Error loading map: ' + e.message);
            this.setState({ loading: false });
        }
    }

    // No structures to tap, so the extra-household flow is the whole screen. The status map is still
    // built: it is what stops a second household being registered on a number already taken.
    showNoStructures(message) {
        const subjects = this.subjectsInCurrentSlum();
        this.setState({
            noStructures: true, noStructuresMessage: message, loading: false, notice: null,
            geojson: null, center: null, filters: [], activeFilter: null,
            statusMap: buildStatusMap(subjects), recent: recentHouseholds(subjects),
        });
    }

    goBack() {
        TypedTransition.from(this).goBack();
    }

    // existingUuid: the household to open (chosen from the duplicate list when there are several).
    // Households and registrations both open on top of the map, so Back returns to the same slum,
    // filter and selection the worker was exploring instead of unwinding to the register page.
    handleConfirm(existingUuid) {
        const { selected, selectedEntry, avniUuid } = this.state;
        const CHSNavigator = require('../utility/CHSNavigator').default;
        const uuid = existingUuid || (selectedEntry ? selectedEntry.uuids[0] : null);
        if (uuid) {
            this.setState({ duplicatePickerOpen: false });
            CHSNavigator.navigateToIndividualRegistrationDetails(this, uuid, null);
            return;
        }
        CHSNavigator.invokeMapPickerCallback(selected, null, avniUuid);
    }

    onConfirmPressed() {
        const { selectedEntry } = this.state;
        if (selectedEntry && selectedEntry.count > 1) {
            this.setState({ duplicatePickerOpen: true });
        } else {
            this.handleConfirm();
        }
    }

    post(message) {
        if (this.webViewRef.current) this.webViewRef.current.postMessage(JSON.stringify(message));
    }

    // "all" numbers every house and wins over "filter" when both are ticked.
    toggleLabels(key) {
        const next = { showLabels: this.state.showLabels, showAllLabels: this.state.showAllLabels, [key]: !this.state[key] };
        this.setState(next);
        this.post({ type: 'showLabels', show: next.showLabels, all: next.showAllLabels });
    }

    clearSelection() {
        this.setState({ selected: null, selectedEntry: null, household: null });
        this.post({ type: 'clearSelection' });
    }

    summarise(entry) {
        if (!entry || entry.count !== 1) return null;
        const individual = this.context.getService(IndividualService).findByUUID(entry.uuids[0]);
        const concepts = this.state.filters.filter(f => f.kind === 'concept').map(f => f.concept);
        return individual ? householdSummary(individual, concepts, this.context.getService(ConceptService)) : null;
    }

    handleSearch() {
        const key = structureKey(this.state.searchText);
        if (!key) return;
        this.post({ type: 'searchStructure', key });
    }

    // Rebuilt only when the slum file changes; render and validation both read it many times.
    structureNumbers() {
        if (this._numbersFor !== this.state.geojson) {
            this._numbersFor = this.state.geojson;
            this._numbers = _(_.get(this.state.geojson, 'features', []))
                .map(feature => String(_.get(feature, 'properties.s', '')).trim())
                .uniqBy(structureKey)
                .sortBy(number => _.padStart(structureKey(number), 12, '0'))
                .value();
            this._keys = this._numbers.map(structureKey);
        }
        return this._numbers;
    }

    structureKeyList() {
        this.structureNumbers();
        return this._keys;
    }

    searchSuggestions() {
        const typed = structureKey(this.state.searchText);
        if (!typed || this.state.selected === this.state.searchText) return [];
        return _(this.structureNumbers())
            .filter(number => _.startsWith(structureKey(number), typed))
            .take(20)
            .value();
    }

    pickSuggestion(number) {
        this.setState({ searchText: number }, () => this.handleSearch());
    }

    renderSuggestions() {
        const suggestions = this.searchSuggestions();
        if (_.isEmpty(suggestions)) return null;
        return (
            <ScrollView style={styles.suggestions} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
                {suggestions.map(number => {
                    const entry = this.state.statusMap[structureKey(number)];
                    return (
                        <TouchableOpacity key={number} style={styles.suggestionRow} onPress={() => this.pickSuggestion(number)}>
                            <Text style={styles.suggestionText}>#{number}</Text>
                            <Text style={styles.suggestionMeta}>
                                {entry ? (entry.count > 1 ? `${entry.count} households` : 'Registered') : 'Not surveyed'}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        );
    }

    onWebViewMessage(event) {
        try {
            const data = JSON.parse(event.nativeEvent.data);
            if (data.type === 'structureSelected') {
                const selectedEntry = this.state.statusMap[structureKey(data.structureId)] || null;
                this.setState({ selected: data.structureId, selectedEntry, household: this.summarise(selectedEntry) });
            } else if (data.type === 'ready') {
                Perf.mark('map.pageReady', {sinceOpen: Date.now() - this.openedAt});
            } else if (data.type === 'tilesUnavailable') {
                if (!this.state.notice) this.setState({ notice: 'No internet: satellite imagery is unavailable, structures are still shown.' });
            } else if (data.type === 'loadError') {
                General.logError('MapPickerScreen', new Error(`map page could not load structures: ${data.message}`));
                alert(`Could not draw the structures of ${this.state.slumName}. Please sync and try again.`);
            } else if (data.type === 'searchNotFound') {
                this.offerExtraHouse(this.state.searchText);
            }
        } catch (e) {
            // ignore malformed messages from the page
        }
    }

    // Built once per slum load; filter changes reach the page by message, a new source would reload Leaflet.
    mapHTML() {
        const { geojson, statusMap } = this.state;
        if (!this.html || this.html.geojson !== geojson || this.html.statusMap !== statusMap) {
            this.html = { geojson, statusMap, text: this.buildMapHTML() };
        }
        return this.html.text;
    }

    buildMapHTML() {
        const { geojson, center, statusMap, avniUuid } = this.state;
        const geojsonUrl = `file://${GisSyncService.slumFilePath(avniUuid)}`;
        return `<!DOCTYPE html>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
    <link rel="stylesheet" href="leaflet/leaflet.css" onerror="this.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'"/>
    <script src="leaflet/leaflet.js"></script>
    <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        html, body, #map { width:100%; height:100%; }
        .leaflet-container { background:#2b2b2b; }
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
function main() {
    // All colours come from src/gis/colorCoding.js — nothing is hardcoded here.
    var STATUS_COLORS = ${JSON.stringify(STATUS_COLORS)};
    var ANSWER_STYLE = ${JSON.stringify(ANSWER_STYLE)};
    var statusMap = ${JSON.stringify(statusMap)};
    var answerByKey = {};
    var answerColors = {};
    var hiddenAnswers = {};   // legend rows the worker unticked under a filter
    var hiddenStatuses = {};  // ...and in the survey-status view
    var filterActive = false;

    var map = L.map('map').setView([${center.lat}, ${center.lng}], 17);

    // Duplicates are drawn with a striped fill: an SVG <pattern> in the renderer, used through fillColor.
    var renderer = L.svg().addTo(map);
    var STRIPE_COLORS = ${JSON.stringify(DUPLICATE_STRIPES)};
    (function addStripes() {
        var svgNS = 'http://www.w3.org/2000/svg';
        var defs = document.createElementNS(svgNS, 'defs');
        var pattern = document.createElementNS(svgNS, 'pattern');
        pattern.setAttribute('id', 'duplicateStripes');
        pattern.setAttribute('patternUnits', 'userSpaceOnUse');
        pattern.setAttribute('patternTransform', 'rotate(45)');
        pattern.setAttribute('width', String(4 * STRIPE_COLORS.length));
        pattern.setAttribute('height', '8');
        STRIPE_COLORS.forEach(function(color, i) {
            var rect = document.createElementNS(svgNS, 'rect');
            rect.setAttribute('x', String(4 * i)); rect.setAttribute('y', '0');
            rect.setAttribute('width', '4'); rect.setAttribute('height', '8');
            rect.setAttribute('fill', color);
            pattern.appendChild(rect);
        });
        defs.appendChild(pattern);
        renderer._container.appendChild(defs);
    })();
    var tiles = L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        attribution:'Google Satellite', maxZoom:22
    }).addTo(map);
    var tilesFailed = false;
    tiles.on('tileerror', function() {  // offline: imagery is missing but the structures still draw
        if (tilesFailed) return;
        tilesFailed = true;
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'tilesUnavailable'}));
    });
    tiles.on('load', function() { tilesFailed = false; });

    var boundary = ${JSON.stringify(geojson.boundary || null)};
    if (boundary) {
        var BOUNDARY_STYLE = ${JSON.stringify(BOUNDARY_STYLE)};
        var boundaryLayer = L.geoJSON(boundary, {
            interactive: false,
            style: {color: BOUNDARY_STYLE.stroke, weight: BOUNDARY_STYLE.weight, dashArray: BOUNDARY_STYLE.dashArray, fill: false}
        }).addTo(map);
        map.fitBounds(boundaryLayer.getBounds(), {padding: [12, 12], maxZoom: 19});
    }

    var geojson = null;  // loaded from the slum file below; keeps the file out of the RN bridge and heap
    var selectedLayer = null;
    var layerIndex = {};
    var labelLayers = [];

    // Same implementation as the React Native side (src/gis/structureNumber.js).
    ${STRUCTURE_KEY_SOURCE}

    function statusStyle(entry) {
        var fill = entry === STATUS_COLORS.duplicate ? 'url(#duplicateStripes)' : entry.fill;
        return {fillColor: fill, fillOpacity: entry.fillOpacity, color: entry.stroke, weight: entry.weight};
    }

    function statusOf(key) {
        var entry = statusMap[key];
        return !entry ? 'notSurveyed' : entry.status === '${STATUS.duplicate}' ? 'duplicate' : 'registered';
    }

    function getStyle(structureId, isSelected, isSearch) {
        var key = structureKey(structureId);
        if (isSearch)   return statusStyle(STATUS_COLORS.searchHit);
        if (isSelected) return statusStyle(STATUS_COLORS.selected);
        if (filterActive) {
            var answer = answerByKey[key];
            if (answer && answerColors[answer] && !hiddenAnswers[answer]) {
                return {fillColor: answerColors[answer], fillOpacity: ANSWER_STYLE.fillOpacity, color: ANSWER_STYLE.stroke, weight: ANSWER_STYLE.weight};
            }
            return statusStyle(statusMap[key] ? STATUS_COLORS.noData : STATUS_COLORS.filteredOut);
        }
        var status = statusOf(key);
        if (hiddenStatuses[status]) return statusStyle(STATUS_COLORS.filteredOut);
        return statusStyle(STATUS_COLORS[status]);
    }

    // Canvas draws thousands of footprints cheaply; only the striped duplicates need the SVG renderer.
    var canvas = L.canvas();
    function isDuplicate(feature) {
        var entry = statusMap[structureKey(feature.properties.s)];
        return !!entry && entry.status === '${STATUS.duplicate}';
    }
    function addStructures(data) {
        geojson = data;
        L.geoJSON(geojson, {
            renderer: canvas,
            filter: function(f) { return !isDuplicate(f); },
            style: function(f) { return getStyle(f.properties.s, false, false); },
            onEachFeature: onEachStructure
        }).addTo(map);
        L.geoJSON(geojson, {
            renderer: renderer,
            filter: isDuplicate,
            style: function(f) { return getStyle(f.properties.s, false, false); },
            onEachFeature: onEachStructure
        }).addTo(map);
        if (filterActive) refreshAll();
        updateLabels();
        window.ReactNativeWebView.postMessage(JSON.stringify({type:'ready'}));
    }

    var request = new XMLHttpRequest();
    request.open('GET', ${JSON.stringify(geojsonUrl)});
    request.onload = function() {
        try { addStructures(JSON.parse(request.responseText)); }
        catch (e) { window.ReactNativeWebView.postMessage(JSON.stringify({type:'loadError', message: String(e)})); }
    };
    request.onerror = function() { window.ReactNativeWebView.postMessage(JSON.stringify({type:'loadError', message: 'cannot read slum file'})); };
    request.send();

    function onEachStructure(feature, layer) {
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

    var showLabels = false;
    var showAllLabels = false;
    function updateLabels() {
        labelLayers.forEach(function(l){ map.removeLayer(l); });
        labelLayers = [];
        if ((!showLabels && !showAllLabels) || !geojson) return;
        var view = map.getBounds();
        geojson.features.forEach(function(feature) {
            var key = structureKey(String(feature.properties.s).trim());
            var layer = layerIndex[key];
            if (!layer) return;
            if (!showAllLabels && (filterActive ? (!answerByKey[key] || hiddenAnswers[answerByKey[key]]) : hiddenStatuses[statusOf(key)])) return;
            var c = layer.getBounds().getCenter();
            if (!view.contains(c)) return;
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

    map.on('moveend', updateLabels);

    function clearSelection() {
        if (!selectedLayer) return;
        selectedLayer.setStyle(getStyle(selectedLayer.feature.properties.s, false, false));
        selectedLayer = null;
    }

    function refreshAll() {
        if (!geojson) return;
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
            if (data.type === 'showLabels') {
                showLabels = data.show;
                showAllLabels = data.all;
                updateLabels();
            }
            if (data.type === 'updateStatus') {
                statusMap = data.statusMap;
                refreshAll();
                updateLabels();
            }
            if (data.type === 'clearSelection') clearSelection();
            if (data.type === 'hideStatuses') {
                hiddenStatuses = {};
                data.hiddenStatuses.forEach(function(status) { hiddenStatuses[status] = true; });
                refreshAll();
                updateLabels();
            }
            if (data.type === 'updateFilter') {
                answerByKey = data.answerByKey;
                answerColors = data.answerColors;
                hiddenAnswers = {};
                (data.hiddenAnswers || []).forEach(function(label) { hiddenAnswers[label] = true; });
                filterActive = Object.keys(answerByKey).length > 0;
                refreshAll();
                updateLabels();
            }
        } catch(err) {}
    }
    document.addEventListener('message', handleMessage);
    window.addEventListener('message', handleMessage);
}

// Leaflet ships in the APK; an APK without it falls back to the CDN, and with no network at all RN is told.
if (window.L) {
    main();
} else {
    var leaflet = document.createElement('script');
    leaflet.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    leaflet.onload = main;
    leaflet.onerror = function() { window.ReactNativeWebView.postMessage(JSON.stringify({type:'loadError', message:'Leaflet is not available'})); };
    document.head.appendChild(leaflet);
}
</script>
</body>
</html>`;
    }

    // Rebuilt only when the slum file or what is registered changes; several renders read it.
    extrasNotOnMap() {
        const { statusMap, geojson } = this.state;
        if (this._extrasFor !== statusMap || this._extrasGeojson !== geojson) {
            this._extrasFor = statusMap;
            this._extrasGeojson = geojson;
            this._extras = extraHouseholds(statusMap, this.structureKeyList());
        }
        return this._extras;
    }

    // A number the latest sync does not cover can only be an extra household.
    offerExtraHouse(number) {
        const key = structureKey(number);
        if (!key) return;
        Alert.alert(`#${key} is not on the map`,
            'It is not among the structures from the latest sync. Register it as an extra house?',
            [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Register', onPress: () => this.setState({ extraPromptOpen: true, extraNumber: key, extraError: null }) },
            ]);
    }

    addExtraHouse() {
        const result = validateExtraHouse(this.state.extraNumber, this.state.statusMap, this.structureKeyList());
        if (!result.ok) {
            this.setState({ extraError: EXTRA_MESSAGES[result.reason] });
            return;
        }
        this.setState({ extraPromptOpen: false, extraNumber: '', extraError: null });
        require('../utility/CHSNavigator').default.invokeMapPickerCallback(result.key, null, this.state.avniUuid, true);
    }

    renderExtraMenu() {
        const extras = this.state.extraMenuOpen ? this.extrasNotOnMap() : [];
        return this.renderPicker({
            visible: this.state.extraMenuOpen,
            title: 'Houses not on the map',
            onClose: () => this.setState({ extraMenuOpen: false }),
            rows: [
                {
                    key: 'add', label: 'Register extra house',
                    subLabel: 'For a household whose number has no structure drawn',
                    onPress: () => this.setState({ extraMenuOpen: false, extraPromptOpen: true, extraNumber: '', extraError: null }),
                },
                {
                    key: 'list', label: `Extra households (${extras.length})`,
                    subLabel: extras.length ? 'Registered but not drawn on the map' : 'None registered yet',
                    onPress: () => this.setState({ extraMenuOpen: false, extraListOpen: extras.length > 0 }),
                },
            ],
        });
    }

    renderExtraList() {
        if (!this.state.extraListOpen) return null;
        const individualService = this.context.getService(IndividualService);
        const rows = _.flatMap(this.extrasNotOnMap(), entry => entry.uuids.map(uuid => {
            const subject = individualService.findByUUID(uuid);
            return {
                key: uuid,
                label: `#${entry.key} — ${subject ? subject.nameString : uuid}`,
                subLabel: subject && subject.registrationDate ? `Registered ${General.formatDate(subject.registrationDate)}` : null,
                onPress: () => {
                    this.setState({ extraListOpen: false });
                    require('../utility/CHSNavigator').default.navigateToIndividualRegistrationDetails(this, uuid, null);
                },
            };
        }));
        return this.renderPicker({
            visible: true, title: 'Households not on the map', rows,
            onClose: () => this.setState({ extraListOpen: false }),
        });
    }

    renderExtraPrompt() {
        if (!this.state.extraPromptOpen) return null;
        const close = () => this.setState({ extraPromptOpen: false, extraError: null });
        return (
            <Modal transparent animationType="fade" onRequestClose={close}>
                <View style={styles.pickerBackdrop}>
                    <View style={styles.promptSheet}>
                        <Text style={styles.pickerTitle}>Register a house that is not on the map</Text>
                        <TextInput
                            style={styles.promptInput}
                            placeholder="House number"
                            placeholderTextColor={Colors.SecondaryText}
                            value={this.state.extraNumber}
                            onChangeText={extraNumber => this.setState({ extraNumber, extraError: null })}
                            autoCapitalize="characters"
                            autoFocus={true}
                            onSubmitEditing={() => this.addExtraHouse()}
                        />
                        {this.state.extraError ? <Text style={styles.promptError}>{this.state.extraError}</Text> : null}
                        <View style={styles.promptActions}>
                            <TouchableOpacity onPress={close}><Text style={styles.promptCancel}>Cancel</Text></TouchableOpacity>
                            <TouchableOpacity onPress={() => this.addExtraHouse()}><Text style={styles.promptOk}>Register</Text></TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        );
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

    renderControls() {
        const { slums, avniUuid, slumPickerOpen, filters, activeFilter, filterOpen, noStructures } = this.state;
        if (noStructures && slums.length <= 1) return null;
        const extras = noStructures ? 0 : this.extrasNotOnMap().length;
        const filterItems = [{ label: 'Survey status', value: STATUS_FILTER }, ...filters.map(f => ({ label: `${f.label} (${f.count})`, value: f.key }))];
        const dropdown = (props) => (
            <DropDownPicker
                listMode="MODAL" modalProps={{ animationType: 'fade' }} modalContentContainerStyle={styles.dropdownModal}
                setValue={_.noop} arrowIconStyle={styles.dropdownArrow}
                style={styles.dropdown} textStyle={styles.dropdownText} dropDownContainerStyle={styles.dropdownList}
                {...props}
            />
        );
        return (
            <View style={styles.controls}>
                {slums.length > 1 && (
                    <View style={styles.control}>
                        {dropdown({
                            items: slums.map(slum => ({ label: slum.name, value: slum.uuid })), value: avniUuid, open: slumPickerOpen,
                            setOpen: open => this.setState({ slumPickerOpen: open, filterOpen: false }),
                            onSelectItem: item => this.switchSlum(_.find(slums, { uuid: item.value })),
                            modalTitle: 'Slum', searchable: slums.length > 8, searchPlaceholder: 'Search slum',
                        })}
                    </View>
                )}
                {!noStructures && (
                    <View style={styles.control}>
                        {dropdown({
                            items: filterItems, value: activeFilter || STATUS_FILTER, open: filterOpen, searchable: true,
                            setOpen: open => this.setState({ filterOpen: open, slumPickerOpen: false }),
                            onSelectItem: item => this.selectFilter(_.find(filters, { key: item.value }) || null),
                            modalTitle: 'Colour houses by', searchPlaceholder: 'Search filter',
                        })}
                    </View>
                )}
                {!noStructures && (
                    <TouchableOpacity style={styles.extraButton} onPress={() => this.setState({ extraMenuOpen: true })}>
                        <AvniIcon name="home-plus-outline" type="MaterialCommunityIcons" style={styles.extraIcon} />
                        {extras > 0 && (
                            <View style={styles.extraBadge}>
                                <Text style={styles.extraBadgeText}>{extras > 99 ? '99+' : extras}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                )}
            </View>
        );
    }

    // Always derived from what the active filter actually computed (answerColors) or the status set.
    renderLegend() {
        const { activeFilter, answerColors, statusMap } = this.state;
        const rows = activeFilter
            ? answerLegend(answerColors)
            : statusLegend({ includeDuplicate: _.some(statusMap, entry => entry.status === STATUS.duplicate) });
        return (
            <ScrollView showsVerticalScrollIndicator={true} style={styles.legendScroll} contentContainerStyle={styles.legendContent}>
                <TouchableOpacity style={[styles.legendItem, styles.legendChip]} onPress={() => this.toggleLabels('showAllLabels')}>
                    <AvniIcon name={this.state.showAllLabels ? 'check-box' : 'check-box-outline-blank'} type="MaterialIcons" style={styles.checkbox} />
                    <Text style={styles.legendText}>All house numbers</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.legendItem, styles.legendChip]} onPress={() => this.toggleLabels('showLabels')}>
                    <AvniIcon name={this.state.showLabels ? 'check-box' : 'check-box-outline-blank'} type="MaterialIcons" style={styles.checkbox} />
                    <Text style={styles.legendText}>Filter house numbers</Text>
                </TouchableOpacity>
                {rows.map(row => {
                    const toggles = activeFilter ? row.key !== 'noData' : _.includes(TOGGLABLE_STATUSES, row.key);
                    const hidden = toggles && _.includes(activeFilter ? this.state.hiddenAnswers : this.state.hiddenStatuses, row.key);
                    return (
                        <TouchableOpacity key={row.key} style={[styles.legendItem, styles.legendChip]} disabled={!toggles} onPress={() => this.toggleLegendRow(row.key)}>
                            <View style={[styles.swatch, hidden && styles.swatchHidden]}>
                                <View style={[StyleSheet.absoluteFill, styles.swatchFill, !row.stripes && { backgroundColor: row.color }]}>
                                    {row.stripes && row.stripes.map((c, i) => <View key={i} style={{ flex: 1, backgroundColor: c }} />)}
                                </View>
                                {toggles && !hidden && <AvniIcon name="check" type="MaterialIcons" style={styles.swatchTick} />}
                            </View>
                            <Text style={[styles.legendText, hidden && styles.legendTextHidden]}>{row.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        );
    }

    renderHouseholdCard() {
        const { household } = this.state;
        if (!household) return null;
        return (
            <View style={styles.householdCard}>
                <View style={styles.panelHeader}>
                    <Text style={styles.householdName}>{household.name || 'Household'} · #{household.number}</Text>
                    {this.renderClose()}
                </View>
                {household.registeredOn && <Text style={styles.householdMeta}>Registered {household.registeredOn}</Text>}
                {household.answers.slice(0, 4).map(({ label, value }, i) => (
                    <Text key={label} style={i === 0 ? styles.householdHeadline : styles.householdAnswer} numberOfLines={1}>
                        {label}: <Text style={styles.householdValue}>{value}</Text>
                    </Text>
                ))}
            </View>
        );
    }

    renderClose() {
        return (
            <TouchableOpacity onPress={() => this.clearSelection()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <AvniIcon name="close" type="MaterialIcons" style={styles.closeIcon} />
            </TouchableOpacity>
        );
    }

    renderBottomBar() {
        const { selected, selectedEntry, browse } = this.state;
        if (!selected) {
            return (
                <View style={styles.hintBar}>
                    <Text style={styles.hintText}>Tap a structure on the map to {browse ? 'see who lives there' : 'select it'}</Text>
                </View>
            );
        }
        const isDuplicate = selectedEntry && selectedEntry.count > 1;
        const label = isDuplicate ? `${selectedEntry.count} households registered here`
            : selectedEntry ? 'Already registered' : browse ? 'Nobody registered here' : 'Selected structure';
        const button = isDuplicate ? 'View households' : selectedEntry ? 'View household' : browse ? 'Register here' : 'Use this';
        const icon = selectedEntry ? 'open-in-new' : 'add';
        return (
            <View style={styles.confirmBar}>
                {!this.state.household && this.renderClose()}
                <View style={styles.confirmInfo}>
                    <Text style={styles.confirmLabel}>{label}</Text>
                    <Text style={styles.confirmId}>#{selected}</Text>
                </View>
                <TouchableOpacity
                    style={[styles.confirmBtn, selectedEntry && styles.confirmBtnExisting, isDuplicate && styles.confirmBtnDuplicate]}
                    onPress={() => this.onConfirmPressed()}>
                    <Text style={styles.confirmBtnText}>{button}</Text>
                    <AvniIcon name={icon} type="MaterialIcons" style={styles.confirmBtnIcon} />
                </TouchableOpacity>
            </View>
        );
    }

    render() {
        const { loading, filterLoading, geojson, center, searchText, slumName, notice, noStructures } = this.state;

        if (loading) {
            return (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.AccentColor} />
                    <Text style={styles.loadingText}>Loading map...</Text>
                </View>
            );
        }

        if (noStructures) {
            return (
                <CHSContainer style={styles.container}>
                    <AppHeader title={slumName || 'Slum map'} func={() => this.goBack()} hideIcon={true} />
                    {this.renderExtraPrompt()}
                    {this.renderControls()}
                    <NoStructures
                        message={this.state.noStructuresMessage}
                        recent={this.state.recent}
                        onRegister={() => this.setState({ extraPromptOpen: true, extraNumber: '', extraError: null })}
                        onOpenHousehold={uuid => require('../utility/CHSNavigator').default.navigateToIndividualRegistrationDetails(this, uuid, null)}
                    />
                </CHSContainer>
            );
        }

        return (
            <CHSContainer style={styles.container}>
                <AppHeader title={slumName || 'Slum map'} func={() => this.goBack()} hideIcon={true} />
                {notice && (
                    <TouchableOpacity style={styles.notice} onPress={() => this.setState({ notice: null })}>
                        <Text style={styles.noticeText}>{notice}</Text>
                        <AvniIcon name="close" type="MaterialIcons" style={styles.noticeClose} />
                    </TouchableOpacity>
                )}

                {this.renderDuplicatePicker()}
                {this.renderExtraMenu()}
                {this.renderExtraList()}
                {this.renderExtraPrompt()}

                <View style={styles.searchBar}>
                    <AvniIcon name="search" type="MaterialIcons" style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Search structure no. (e.g. 1 or 0001)"
                        placeholderTextColor={Colors.SecondaryText}
                        value={searchText}
                        onChangeText={(text) => this.setState({ searchText: text })}
                        autoCapitalize="characters"
                        returnKeyType="search"
                        onSubmitEditing={() => this.handleSearch()}
                    />
                    {!!searchText && (
                        <TouchableOpacity onPress={() => this.setState({ searchText: '' })}>
                            <AvniIcon name="close" type="MaterialIcons" style={styles.searchIcon} />
                        </TouchableOpacity>
                    )}
                </View>

                {this.renderSuggestions()}
                {this.renderControls()}
                {this.renderLegend()}

                <View style={styles.mapContainer}>
                    {geojson && center && (
                        <WebView
                            ref={this.webViewRef}
                            style={styles.map}
                            source={{ html: this.mapHTML(), baseUrl: 'file:///android_asset/' }}
                            onMessage={(event) => this.onWebViewMessage(event)}
                            javaScriptEnabled={true}
                            domStorageEnabled={true}
                            allowFileAccess={true}
                            allowFileAccessFromFileURLs={true}
                            allowUniversalAccessFromFileURLs={true}
                            originWhitelist={['*']}
                        />
                    )}
                    {filterLoading && (
                        <View style={styles.filterLoadingOverlay}>
                            <View style={styles.filterLoadingBox}>
                                <ActivityIndicator size="large" color={Colors.AccentColor} />
                                <Text style={styles.filterLoadingText}>Applying filter...</Text>
                            </View>
                        </View>
                    )}
                </View>

                {this.renderHouseholdCard()}
                {this.renderBottomBar()}
            </CHSContainer>
        );
    }
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.cardBackgroundColor },
    centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { marginTop: 12, fontSize: 16, color: Colors.DetailsTextColor },
    notice: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF8E1', paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
    noticeText: { flex: 1, fontSize: 13, color: Colors.DefaultPrimaryColor },
    noticeClose: { fontSize: 18, color: Colors.SecondaryText },
    searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.cardBackgroundColor, borderBottomWidth: 1, borderBottomColor: Colors.InputBorderNormal },
    searchIcon: { fontSize: 22, color: Colors.SecondaryText },
    searchInput: { flex: 1, height: 36, fontSize: 14, color: Colors.DefaultPrimaryColor },
    controls: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.cardBackgroundColor, zIndex: 3000 },
    control: { flex: 1 },
    dropdown: { minHeight: 36, borderColor: Colors.InputBorderNormal, borderRadius: 4, backgroundColor: Colors.cardBackgroundColor },
    dropdownText: { fontSize: 13, color: Colors.DefaultPrimaryColor },
    dropdownList: { borderColor: Colors.InputBorderNormal, backgroundColor: Colors.cardBackgroundColor, elevation: 8, maxHeight: 240 },
    dropdownModal: { backgroundColor: Colors.cardBackgroundColor },
    suggestions: { flexGrow: 0, maxHeight: 180, backgroundColor: Colors.cardBackgroundColor, borderBottomWidth: 1, borderBottomColor: Colors.InputBorderNormal },
    suggestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.InputBorderNormal },
    suggestionText: { fontSize: 15, color: Colors.DefaultPrimaryColor },
    suggestionMeta: { fontSize: 12, color: Colors.SecondaryText },
    dropdownArrow: { tintColor: Colors.DefaultPrimaryColor },
    legendScroll: { flexGrow: 0, backgroundColor: Colors.cardBackgroundColor, borderBottomWidth: 1, borderBottomColor: Colors.InputBorderNormal, maxHeight: 140 },
    legendContent: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: Colors.InputBorderNormal, backgroundColor: Colors.GreyContentBackground },
    swatch: { width: 18, height: 18, borderRadius: 3, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    swatchFill: { flexDirection: 'row' },
    swatchHidden: { opacity: 0.3 },
    swatchTick: { fontSize: 15, color: Colors.TextOnPrimaryColor, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 2 },
    legendText: { fontSize: 11, color: Colors.DetailsTextColor },
    legendTextHidden: { color: Colors.SecondaryText, textDecorationLine: 'line-through' },
    checkbox: { fontSize: 18, color: Colors.AccentColor },
    panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    closeIcon: { fontSize: 22, color: Colors.SecondaryText },
    confirmInfo: { flex: 1, marginLeft: 12 },
    mapContainer: { flex: 1, backgroundColor: Colors.BlackBackground },
    map: { flex: 1 },
    filterLoadingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
    filterLoadingBox: { backgroundColor: Colors.cardBackgroundColor, borderRadius: 12, padding: 24, alignItems: 'center', gap: 12 },
    filterLoadingText: { fontSize: 15, color: Colors.DefaultPrimaryColor, marginTop: 8 },
    householdCard: { backgroundColor: Colors.cardBackgroundColor, borderTopWidth: 1, borderColor: Colors.InputBorderNormal, paddingHorizontal: 16, paddingVertical: 8 },
    householdName: { fontSize: 15, fontWeight: '500', color: Colors.DefaultPrimaryColor },
    householdMeta: { fontSize: 12, color: Colors.SecondaryText, marginBottom: 2 },
    householdHeadline: { fontSize: 14, color: Colors.DefaultPrimaryColor, marginBottom: 2 },
    householdAnswer: { fontSize: 13, color: Colors.DetailsTextColor },
    householdValue: { color: Colors.DefaultPrimaryColor, fontWeight: '500' },
    confirmBar: { backgroundColor: Colors.cardBackgroundColor, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: Colors.InputBorderNormal },
    confirmLabel: { fontSize: 12, color: Colors.SecondaryText },
    confirmId: { fontSize: 18, fontWeight: '500', color: Colors.AccentColor },
    confirmBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.ActionButtonColor, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 4, elevation: 2 },
    confirmBtnExisting: { backgroundColor: STATUS_COLORS.registered.fill },
    confirmBtnDuplicate: { backgroundColor: STATUS_COLORS.duplicate.fill },
    confirmBtnText: { color: Colors.TextOnPrimaryColor, fontWeight: '500', fontSize: 15 },
    confirmBtnIcon: { color: Colors.TextOnPrimaryColor, fontSize: 18 },
    hintBar: { backgroundColor: Colors.cardBackgroundColor, padding: 16, alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.InputBorderNormal },
    hintText: { color: Colors.SecondaryText, fontSize: 14 },
    pickerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
    extraButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    extraIcon: { fontSize: 24, color: Colors.AccentColor },
    extraBadge: { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, paddingHorizontal: 3, borderRadius: 8, backgroundColor: Colors.ValidationError, alignItems: 'center', justifyContent: 'center' },
    extraBadgeText: { fontSize: 10, fontWeight: 'bold', color: Colors.TextOnPrimaryColor },
    promptSheet: { backgroundColor: Colors.cardBackgroundColor, borderRadius: 8, padding: 16, marginHorizontal: 24 },
    promptInput: { borderBottomWidth: 1, borderBottomColor: Colors.InputBorderNormal, fontSize: 16, color: Colors.DefaultPrimaryColor, paddingVertical: 6 },
    promptError: { color: Colors.ValidationError, fontSize: 12, marginTop: 8 },
    promptActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 24, marginTop: 16 },
    promptCancel: { fontSize: 14, color: Colors.SecondaryText },
    promptOk: { fontSize: 14, color: Colors.AccentColor, fontWeight: 'bold' },
    pickerSheet: { backgroundColor: Colors.cardBackgroundColor, borderRadius: 8, maxHeight: '70%', paddingVertical: 8 },
    pickerTitle: { fontSize: 16, fontWeight: '600', color: Colors.DefaultPrimaryColor, paddingHorizontal: 16, paddingVertical: 8 },
    pickerRow: { paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: Colors.InputBorderNormal },
    pickerText: { fontSize: 16, color: Colors.DefaultPrimaryColor },
    pickerTextActive: { color: Colors.AccentColor, fontWeight: '600' },
    pickerSubText: { fontSize: 12, color: Colors.SecondaryText, marginTop: 2 },
});

export default MapPickerScreen;
