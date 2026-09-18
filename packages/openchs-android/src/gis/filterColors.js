import _ from "lodash";

const norm = text => _.toLower(_.trim(text));

// {answerLabel: polycolor} for one concept, from the GIS server's filter rows
// (get_structures_for_avni "filters"). Empty when nothing covers the concept.
export function presetAnswerColors(filters, conceptName) {
    const colors = {};
    _.forEach(filters, filter => {
        if (!_.some(filter.concepts, concept => norm(concept) === norm(conceptName))) return;
        _.forEach(filter.answers, answer => {
            if (!_.has(colors, answer)) colors[answer] = filter.polycolor;
        });
    });
    return colors;
}
