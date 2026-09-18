// Turning an Avni observation into the label(s) the map colours by.
//
// Coded answers are stored as concept uuids (one uuid for single select, an
// array for multi select) and must be resolved through ConceptService; text,
// numeric and other primitives are used as-is. The decision is made from
// concept.datatype, never by guessing at the value's shape.
import {Concept} from "avni-models";
import _ from "lodash";

export const MULTI_SELECT_SEPARATOR = " + ";

const items = list => Array.from(list || []);  // Realm lists are iterable but not arrays

// Everything a household has answered: registration, then enrolments, then visits newest first.
export function subjectObservations(subject) {
    const enrolments = _.reject(items(subject.enrolments), "voided");
    const encounters = _.reject(_.flatMap([subject, ...enrolments], e => items(e.encounters)), "voided");
    const newestFirst = _.orderBy(encounters, e => e.encounterDateTime ? new Date(e.encounterDateTime).getTime() : 0, "desc");
    return _.flatMap([subject, ...enrolments, ...newestFirst], e => items(e.observations));
}

// {conceptUuid: observation}, first one wins, so every concept is a lookup instead of a scan (Realm reads are slow).
export function answerIndex(subject, {registrationOnly = false} = {}) {
    const index = {};
    _.forEach(registrationOnly ? items(subject.observations) : subjectObservations(subject), observation => {
        const uuid = _.get(observation, "concept.uuid");
        if (uuid && !index[uuid]) index[uuid] = observation;
    });
    return index;
}

// Whether an observation carries a value, without resolving what it says.
export function hasAnswer(observation) {
    if (_.isNil(observation)) return false;
    const wrapper = observation.getValueWrapper();
    const value = wrapper && wrapper.getValue();
    return !_.isNil(value) && value !== "" && !(_.isArray(value) && _.isEmpty(value));
}

function answerOrder(concept) {
    const order = {};
    _.forEach(_.get(concept, "answers"), answer => {
        const uuid = _.get(answer, "concept.uuid");
        if (uuid) order[uuid] = _.isNil(answer.answerOrder) ? Number.MAX_SAFE_INTEGER : answer.answerOrder;
    });
    return order;
}

// value -> labels for one concept: the answer order and names are read once, then reused for every household.
export function valueLabeller(concept, conceptService) {
    if (concept.datatype !== Concept.dataType.Coded) return value => (_.isNil(value) || value === "" ? [] : [String(value)]);
    const order = answerOrder(concept);
    const names = {};
    const nameOf = uuid => {
        if (!(uuid in names)) {
            const answerConcept = conceptService.getConceptByUUID(uuid);
            names[uuid] = answerConcept ? answerConcept.name : uuid;
        }
        return names[uuid];
    };
    return value => _(_.isArray(value) ? value : [value])
        .filter(uuid => !_.isNil(uuid) && uuid !== "")
        .sortBy(uuid => _.get(order, uuid, Number.MAX_SAFE_INTEGER))
        .map(nameOf)
        .value();
}

export function labelsForValue(concept, value, conceptService) {
    return valueLabeller(concept, conceptService)(value);
}

// Display labels for one observation: [] when there is no value, one label
// for single-select / primitive answers, one per selected answer (in the
// concept's answer order) for multi-select.
export function answerLabels(observation, conceptService) {
    if (_.isNil(observation) || _.isNil(observation.concept)) return [];
    const wrapper = observation.getValueWrapper();
    if (_.isNil(wrapper)) return [];
    const datatype = observation.concept.datatype;
    if ((datatype === Concept.dataType.Date || datatype === Concept.dataType.DateTime) && wrapper.asDisplayDate) {
        const shown = wrapper.asDisplayDate();
        return _.isEmpty(shown) ? [] : [shown];
    }
    return labelsForValue(observation.concept, wrapper.getValue(), conceptService);
}

// The single key the map colours a household by. A multi-select household
// is keyed by all of its answers together ("Yes + Shared"), so every distinct
// combination gets its own colour and legend row rather than one answer
// silently winning.
export function combinedAnswerLabel(labels) {
    return _.isEmpty(labels) ? null : labels.join(MULTI_SELECT_SEPARATOR);
}
