// Turning an Avni observation into the label(s) the map colours by.
//
// Coded answers are stored as concept uuids (one uuid for single select, an
// array for multi select) and must be resolved through ConceptService; text,
// numeric and other primitives are used as-is. The decision is made from
// concept.datatype, never by guessing at the value's shape.
import {Concept} from "avni-models";
import _ from "lodash";

export const MULTI_SELECT_SEPARATOR = " + ";

// The observation for a concept, matched by uuid when given, else by name.
export function findObservation(observations, concept) {
    if (_.isEmpty(observations) || _.isNil(concept)) return null;
    const matches = concept.uuid
        ? obs => _.get(obs, "concept.uuid") === concept.uuid
        : obs => _.get(obs, "concept.name") === concept.name;
    return _.find(observations, matches) || null;
}

function answerOrder(concept) {
    const order = {};
    _.forEach(_.get(concept, "answers"), answer => {
        const uuid = _.get(answer, "concept.uuid");
        if (uuid) order[uuid] = _.isNil(answer.answerOrder) ? Number.MAX_SAFE_INTEGER : answer.answerOrder;
    });
    return order;
}

function codedLabels(observation, conceptService) {
    const wrapper = observation.getValueWrapper();
    const value = wrapper.getValue();
    const uuids = _.isArray(value) ? value : [value];
    const order = answerOrder(observation.concept);
    return _(uuids)
        .filter(uuid => !_.isNil(uuid) && uuid !== "")
        .sortBy(uuid => _.get(order, uuid, Number.MAX_SAFE_INTEGER))
        .map(uuid => {
            const answerConcept = conceptService.getConceptByUUID(uuid);
            return answerConcept ? answerConcept.name : uuid;
        })
        .value();
}

// Display labels for one observation: [] when there is no value, one label
// for single-select / primitive answers, one per selected answer (in the
// concept's answer order) for multi-select.
export function answerLabels(observation, conceptService) {
    if (_.isNil(observation) || _.isNil(observation.concept)) return [];
    const datatype = observation.concept.datatype;
    if (datatype === Concept.dataType.Coded) return codedLabels(observation, conceptService);
    const wrapper = observation.getValueWrapper();
    if (_.isNil(wrapper)) return [];
    if ((datatype === Concept.dataType.Date || datatype === Concept.dataType.DateTime) && wrapper.asDisplayDate) {
        const shown = wrapper.asDisplayDate();
        return _.isEmpty(shown) ? [] : [shown];
    }
    const value = wrapper.getValue();
    if (_.isNil(value) || value === "") return [];
    return [String(value)];
}

// The single key the map colours a household by. A multi-select household
// is keyed by all of its answers together ("Yes + Shared"), so every distinct
// combination gets its own colour and legend row rather than one answer
// silently winning.
export function combinedAnswerLabel(labels) {
    return _.isEmpty(labels) ? null : labels.join(MULTI_SELECT_SEPARATOR);
}
