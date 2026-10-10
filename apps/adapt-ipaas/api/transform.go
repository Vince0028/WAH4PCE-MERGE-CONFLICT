package handler

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
)

// ─── Types ───────────────────────────────────────────────────────────────────

type TransformRequest struct {
	Payload   map[string]interface{} `json:"payload"`
	Direction string                 `json:"direction"`
}

type TransformResponse struct {
	Success bool                   `json:"success"`
	Data    map[string]interface{} `json:"data"`
	Error   string                 `json:"error,omitempty"`
	Model   string                 `json:"model"`
}

// ─── Field Extraction ─────────────────────────────────────────────────────────

type Row struct {
	Category string
	Label    string
	Value    string
}

func str(v interface{}) string {
	if v == nil {
		return ""
	}
	return strings.TrimSpace(fmt.Sprintf("%v", v))
}

func extractHL7Data(payload map[string]interface{}) []Row {
	vitals, _ := payload["vitals"].(map[string]interface{})
	g := func(k string) string {
		if v, ok := payload[k]; ok && str(v) != "" {
			return str(v)
		}
		if vitals != nil {
			if v, ok := vitals[k]; ok && str(v) != "" && str(v) != "0" {
				return str(v)
			}
		}
		return ""
	}

	var rows []Row
	add := func(cat, label, val string) {
		if val != "" {
			rows = append(rows, Row{cat, label, val})
		}
	}

	add("Patient", "First Name", g("patient_fname"))
	add("Patient", "Last Name", g("patient_lname"))
	add("Patient", "Middle Name", g("patient_mname"))
	add("Patient", "Suffix", g("patient_suffix"))
	add("Patient", "Date of Birth", g("dob"))
	add("Patient", "Sex", g("sex"))
	add("Patient", "Civil Status", g("civil_status"))
	add("Patient", "PhilHealth No.", g("philhealth_no"))
	add("Patient", "Contact No.", g("contact_no"))
	add("Patient", "Street", g("address_street"))
	add("Patient", "Barangay", g("address_barangay"))
	add("Patient", "City", g("address_city"))
	add("Patient", "Province", g("address_province"))
	add("Vitals", "BP Systolic", g("bp_systolic"))
	add("Vitals", "BP Diastolic", g("bp_diastolic"))
	add("Vitals", "Heart Rate", g("heart_rate"))
	add("Vitals", "Temperature", g("temperature"))
	add("Vitals", "Respiratory Rate", g("respiratory_rate"))
	add("Vitals", "SpO2", g("oxygen_saturation"))
	add("Vitals", "Weight (kg)", g("weight_kg"))
	add("Vitals", "Height (cm)", g("height_cm"))
	add("Diagnosis", "Chief Complaint", g("chief_complaint"))
	add("Diagnosis", "ICD-10 Code", g("diagnosis_code"))
	add("Diagnosis", "Description", g("diagnosis_desc"))
	add("Diagnosis", "Priority", g("priority"))
	add("Referral", "Facility", g("referring_facility_name"))
	add("Referral", "Physician", g("referring_physician"))

	return rows
}

func extractFHIRData(payload map[string]interface{}) []Row {
	var rows []Row
	add := func(cat, label string, val interface{}) {
		s := str(val)
		if s != "" {
			rows = append(rows, Row{cat, label, s})
		}
	}

	entries, _ := payload["entry"].([]interface{})
	var resources []map[string]interface{}
	for _, e := range entries {
		if em, ok := e.(map[string]interface{}); ok {
			if r, ok := em["resource"].(map[string]interface{}); ok {
				resources = append(resources, r)
			}
		}
	}
	if len(resources) == 0 {
		if _, ok := payload["resourceType"]; ok {
			resources = append(resources, payload)
		}
	}

	chiefComplaintFound := false

	for _, res := range resources {
		rt, _ := res["resourceType"].(string)

		if rt == "Patient" {
			var nameMap map[string]interface{}
			if names, ok := res["name"].([]interface{}); ok && len(names) > 0 {
				nameMap, _ = names[0].(map[string]interface{})
			}
			if nameMap != nil {
				given, _ := nameMap["given"].([]interface{})
				if len(given) > 0 {
					add("Patient", "Given Name", given[0])
				}
				if len(given) > 1 {
					var midParts []string
					for _, g := range given[1:] {
						midParts = append(midParts, str(g))
					}
					add("Patient", "Middle Name", strings.Join(midParts, " "))
				}
				add("Patient", "Family Name", nameMap["family"])
				if suf, ok := nameMap["suffix"].([]interface{}); ok && len(suf) > 0 {
					add("Patient", "Suffix", suf[0])
				}
			}
			add("Patient", "Birth Date", res["birthDate"])
			add("Patient", "Gender", res["gender"])

			if ids, ok := res["identifier"].([]interface{}); ok {
				for _, id := range ids {
					idm, _ := id.(map[string]interface{})
					sys, _ := idm["system"].(string)
					if strings.Contains(sys, "philhealth") {
						add("Patient", "PhilHealth No.", idm["value"])
					}
				}
			}
			if telecoms, ok := res["telecom"].([]interface{}); ok {
				for _, t := range telecoms {
					tm, _ := t.(map[string]interface{})
					add("Patient", "Phone", tm["value"])
				}
			}
			if addrs, ok := res["address"].([]interface{}); ok && len(addrs) > 0 {
				addrm, _ := addrs[0].(map[string]interface{})
				if lines, ok := addrm["line"].([]interface{}); ok {
					var ls []string
					for _, l := range lines {
						ls = append(ls, str(l))
					}
					add("Patient", "Address Line", strings.Join(ls, ", "))
				}
				add("Patient", "City", addrm["city"])
				if addrm["state"] != nil {
					add("Patient", "Province/State", addrm["state"])
				} else {
					add("Patient", "Province/State", addrm["district"])
				}
			}
		}

		if rt == "Encounter" {
			if cls, ok := res["class"].(map[string]interface{}); ok {
				if d := str(cls["display"]); d != "" {
					add("Encounter", "Class", d)
				} else {
					add("Encounter", "Class", cls["code"])
				}
			}
			if prio, ok := res["priority"].(map[string]interface{}); ok {
				if codings, ok := prio["coding"].([]interface{}); ok && len(codings) > 0 {
					cm, _ := codings[0].(map[string]interface{})
					if d := str(cm["display"]); d != "" {
						add("Encounter", "Priority", d)
					} else {
						add("Encounter", "Priority", cm["code"])
					}
				} else {
					add("Encounter", "Priority", prio["text"])
				}
			}
			var reason string
			if rc, ok := res["reasonCode"].([]interface{}); ok && len(rc) > 0 {
				rcm, _ := rc[0].(map[string]interface{})
				reason = str(rcm["text"])
			}
			add("Encounter", "Reason", reason)
			if sp, ok := res["serviceProvider"].(map[string]interface{}); ok {
				if d := str(sp["display"]); d != "" {
					add("Encounter", "Facility", d)
				} else {
					add("Encounter", "Facility", sp["reference"])
				}
			}
			if parts, ok := res["participant"].([]interface{}); ok && len(parts) > 0 {
				pm, _ := parts[0].(map[string]interface{})
				if ind, ok := pm["individual"].(map[string]interface{}); ok {
					add("Encounter", "Physician", ind["display"])
				}
			}
		}

		if rt == "Observation" {
			var display string
			if code, ok := res["code"].(map[string]interface{}); ok {
				display = str(code["text"])
				if display == "" {
					if codings, ok := code["coding"].([]interface{}); ok && len(codings) > 0 {
						cm, _ := codings[0].(map[string]interface{})
						display = str(cm["display"])
					}
				}
			}
			if display == "" {
				display = "Observation"
			}
			if comps, ok := res["component"].([]interface{}); ok {
				for _, comp := range comps {
					cm, _ := comp.(map[string]interface{})
					var compName string
					if code, ok := cm["code"].(map[string]interface{}); ok {
						if codings, ok := code["coding"].([]interface{}); ok && len(codings) > 0 {
							cg, _ := codings[0].(map[string]interface{})
							compName = str(cg["display"])
						}
					}
					if vq, ok := cm["valueQuantity"].(map[string]interface{}); ok {
						add("Vitals", compName, vq["value"])
					}
				}
			} else if vq, ok := res["valueQuantity"].(map[string]interface{}); ok {
				add("Vitals", display, vq["value"])
			}
		}

		if rt == "Condition" {
			if code, ok := res["code"].(map[string]interface{}); ok {
				if codings, ok := code["coding"].([]interface{}); ok && len(codings) > 0 {
					cm, _ := codings[0].(map[string]interface{})
					add("Diagnosis", "ICD-10 Code", cm["code"])
					if d := str(cm["display"]); d != "" {
						add("Diagnosis", "Description", d)
					} else {
						add("Diagnosis", "Description", code["text"])
					}
				}
			}
			if cs, ok := res["clinicalStatus"].(map[string]interface{}); ok {
				if codings, ok := cs["coding"].([]interface{}); ok && len(codings) > 0 {
					cm, _ := codings[0].(map[string]interface{})
					add("Diagnosis", "Clinical Status", cm["code"])
				}
			}
			if notes, ok := res["note"].([]interface{}); ok && len(notes) > 0 {
				nm, _ := notes[0].(map[string]interface{})
				add("Diagnosis", "Chief Complaint", nm["text"])
				chiefComplaintFound = true
			}
		}
	}

	if !chiefComplaintFound {
		for _, res := range resources {
			if rt, _ := res["resourceType"].(string); rt == "Encounter" {
				if rc, ok := res["reasonCode"].([]interface{}); ok && len(rc) > 0 {
					rcm, _ := rc[0].(map[string]interface{})
					if t := str(rcm["text"]); t != "" {
						rows = append(rows, Row{"Diagnosis", "Chief Complaint", t})
						break
					}
				}
			}
		}
	}

	return rows
}

func extractDataFields(payload map[string]interface{}) []Row {
	rt, _ := payload["resourceType"].(string)
	_, hasEntry := payload["entry"]
	if rt == "Bundle" || hasEntry {
		return extractFHIRData(payload)
	}
	if rt != "" {
		return extractFHIRData(payload)
	}
	// Try HL7 (flat JSON)
	_, hasFname := payload["patient_fname"]
	_, hasLname := payload["patient_lname"]
	_, hasPhil := payload["philhealth_no"]
	_, hasBp := payload["bp_systolic"]
	if hasFname || hasLname || hasPhil || hasBp {
		return extractHL7Data(payload)
	}
	hl7 := extractHL7Data(payload)
	if len(hl7) > 0 {
		return hl7
	}
	return extractFHIRData(payload)
}

// ─── Field Lookup ─────────────────────────────────────────────────────────────

var aliasMap = map[string][]string{
	"Given Name":            {"Given Name"},
	"Family Name":           {"Family Name"},
	"Birth Date":            {"Birth Date"},
	"Gender":                {"Gender"},
	"PhilHealth ID":         {"PhilHealth No.", "PhilHealth ID"},
	"Phone":                 {"Phone", "Contact No."},
	"Address":               {"Address Line", "Street", "Address"},
	"Class":                 {"Class"},
	"Reason":                {"Reason"},
	"Facility":              {"Facility", "Referring Facility"},
	"Physician":             {"Physician", "Requester"},
	"BP Systolic":           {"BP Systolic", "Systolic blood pressure", "Systolic Blood Pressure"},
	"BP Diastolic":          {"BP Diastolic", "Diastolic blood pressure", "Diastolic Blood Pressure"},
	"Heart Rate":            {"Heart Rate", "Heart rate"},
	"Temperature":           {"Temperature", "Body temperature", "Body Temperature"},
	"Respiratory Rate":      {"Respiratory Rate", "Respiratory rate"},
	"SpO2":                  {"SpO2", "Oxygen saturation", "Oxygen Saturation"},
	"Weight (kg)":           {"Weight (kg)", "Body weight", "Body Weight"},
	"Height (cm)":           {"Height (cm)", "Body height", "Body Height"},
	"Display":               {"Display", "Description", "Diagnosis Description"},
	"Clinical Status":       {"Clinical Status", "Clinical Notes"},
	"Chief Complaint":       {"Chief Complaint"},
	"ICD-10 Code":           {"ICD-10 Code"},
	"Middle Name":           {"Middle Name"},
	"City":                  {"City"},
	"Priority":              {"Priority"},
	"First Name":            {"First Name", "Given Name"},
	"Last Name":             {"Last Name", "Family Name"},
	"Date of Birth":         {"Date of Birth", "Birth Date"},
	"Sex":                   {"Sex", "Gender"},
	"Civil Status":          {"Civil Status", "Marital Status"},
	"Contact No.":           {"Contact No.", "Phone"},
	"Street":                {"Street", "Address Line", "Address"},
	"Province":              {"Province", "Province/State"},
	"Barangay":              {"Barangay"},
	"Suffix":                {"Suffix"},
	"PhilHealth No.":        {"PhilHealth No.", "PhilHealth ID"},
	"Diagnosis Description": {"Diagnosis Description", "Description", "Display"},
	"Referring Facility":    {"Referring Facility", "Facility"},
}

var fieldMap = [][2]string{
	{"First Name", "Given Name"},
	{"Last Name", "Family Name"},
	{"Middle Name", "Middle Name"},
	{"Date of Birth", "Birth Date"},
	{"Sex", "Gender"},
	{"PhilHealth No.", "PhilHealth ID"},
	{"Contact No.", "Phone"},
	{"Street", "Address"},
	{"City", "City"},
	{"BP Systolic", "BP Systolic"},
	{"BP Diastolic", "BP Diastolic"},
	{"Heart Rate", "Heart Rate"},
	{"Temperature", "Temperature"},
	{"Respiratory Rate", "Respiratory Rate"},
	{"SpO2", "SpO2"},
	{"Weight (kg)", "Weight (kg)"},
	{"Height (cm)", "Height (cm)"},
	{"Chief Complaint", "Chief Complaint"},
	{"ICD-10 Code", "ICD-10 Code"},
	{"Diagnosis Description", "Display"},
	{"Priority", "Priority"},
	{"Physician", "Physician"},
	{"Referring Facility", "Facility"},
}

func findValue(label string, rows []Row, isDestWAH bool) string {
	for _, r := range rows {
		if r.Label == label {
			return r.Value
		}
	}
	if aliases, ok := aliasMap[label]; ok {
		for _, alias := range aliases {
			for _, r := range rows {
				if r.Label == alias {
					return r.Value
				}
			}
		}
	}
	lower := strings.ToLower(label)
	for _, r := range rows {
		if strings.ToLower(r.Label) == lower {
			return r.Value
		}
	}
	for _, pair := range fieldMap {
		var destLabel, srcLabel string
		if isDestWAH {
			destLabel, srcLabel = pair[1], pair[0]
		} else {
			destLabel, srcLabel = pair[0], pair[1]
		}
		if destLabel == label {
			for _, r := range rows {
				if r.Label == srcLabel {
					return r.Value
				}
			}
		}
	}
	return ""
}

// ─── Core Transform Logic ─────────────────────────────────────────────────────

func toNum(s string) interface{} {
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return s
}

func fallbackTransform(payload map[string]interface{}, direction string) map[string]interface{} {
	rows := extractDataFields(payload)
	isDestWAH := direction == "HL7V2_TO_FHIR_R4" || direction == "IHOMIS_TO_FHIR"
	get := func(label string) string {
		return findValue(label, rows, isDestWAH)
	}
	findDirect := func(label string) string {
		for _, r := range rows {
			if r.Label == label {
				return r.Value
			}
		}
		return ""
	}

	if isDestWAH {
		// Build FHIR R4 Transaction Bundle
		entry := []interface{}{
			map[string]interface{}{
				"resource": map[string]interface{}{
					"resourceType": "Patient",
					"identifier": []interface{}{
						map[string]interface{}{
							"system": "https://www.philhealth.gov.ph/memberid",
							"value":  get("PhilHealth ID"),
						},
					},
					"name": []interface{}{
						map[string]interface{}{
							"family": get("Family Name"),
							"given":  filterEmpty([]string{get("Given Name"), get("Middle Name")}),
							"suffix": filterEmpty([]string{findDirect("Suffix")}),
						},
					},
					"gender":    get("Gender"),
					"birthDate": get("Birth Date"),
					"telecom": []interface{}{
						map[string]interface{}{"value": get("Phone")},
					},
					"address": []interface{}{
						map[string]interface{}{
							"line": filterEmpty([]string{get("Address")}),
							"city": get("City"),
						},
					},
				},
			},
			map[string]interface{}{
				"resource": map[string]interface{}{
					"resourceType": "Encounter",
					"class":        map[string]interface{}{"code": orDefault(get("Class"), "AMB")},
					"priority":     map[string]interface{}{"text": get("Priority")},
					"reasonCode":   []interface{}{map[string]interface{}{"text": get("Reason")}},
					"serviceProvider": map[string]interface{}{
						"display": get("Facility"),
					},
					"participant": []interface{}{
						map[string]interface{}{
							"individual": map[string]interface{}{"display": get("Physician")},
						},
					},
				},
			},
			map[string]interface{}{
				"resource": map[string]interface{}{
					"resourceType": "Condition",
					"code": map[string]interface{}{
						"coding": []interface{}{
							map[string]interface{}{
								"code":    get("ICD-10 Code"),
								"display": get("Display"),
							},
						},
					},
					"clinicalStatus": map[string]interface{}{
						"coding": []interface{}{
							map[string]interface{}{"code": get("Clinical Status")},
						},
					},
					"note": []interface{}{
						map[string]interface{}{"text": get("Chief Complaint")},
					},
				},
			},
		}

		// Add vital observations
		vitals := [][3]string{
			{"BP Systolic", "8480-6", "Systolic blood pressure"},
			{"BP Diastolic", "8462-4", "Diastolic blood pressure"},
			{"Heart Rate", "8867-4", "Heart rate"},
			{"Temperature", "8310-5", "Body temperature"},
			{"Respiratory Rate", "9279-1", "Respiratory rate"},
			{"SpO2", "2708-6", "Oxygen saturation"},
			{"Weight (kg)", "29463-7", "Body weight"},
			{"Height (cm)", "8302-2", "Body height"},
		}
		for _, v := range vitals {
			val := get(v[0])
			if val != "" {
				entry = append(entry, map[string]interface{}{
					"resource": map[string]interface{}{
						"resourceType": "Observation",
						"code": map[string]interface{}{
							"coding": []interface{}{
								map[string]interface{}{"code": v[1], "display": v[2]},
							},
						},
						"valueQuantity": map[string]interface{}{"value": toNum(val)},
					},
				})
			}
		}

		return map[string]interface{}{
			"resourceType": "Bundle",
			"type":         "transaction",
			"entry":        entry,
		}
	}

	// FHIR → HL7V2 flat JSON
	return map[string]interface{}{
		"patient_fname":           get("First Name"),
		"patient_lname":           get("Last Name"),
		"patient_mname":           get("Middle Name"),
		"dob":                     get("Date of Birth"),
		"sex":                     mapSex(get("Sex")),
		"civil_status":            get("Civil Status"),
		"philhealth_no":           get("PhilHealth No."),
		"contact_no":              get("Contact No."),
		"address_street":          get("Street"),
		"address_city":            get("City"),
		"vitals": map[string]interface{}{
			"bp_systolic":       get("BP Systolic"),
			"bp_diastolic":      get("BP Diastolic"),
			"heart_rate":        get("Heart Rate"),
			"temperature":       get("Temperature"),
			"respiratory_rate":  get("Respiratory Rate"),
			"oxygen_saturation": get("SpO2"),
			"weight_kg":         get("Weight (kg)"),
			"height_cm":         get("Height (cm)"),
		},
		"chief_complaint":          get("Chief Complaint"),
		"diagnosis_code":           get("ICD-10 Code"),
		"diagnosis_desc":           get("Diagnosis Description"),
		"priority":                 get("Priority"),
		"referring_facility_name":  get("Referring Facility"),
		"referring_physician":      get("Physician"),
	}
}

func filterEmpty(ss []string) []string {
	var out []string
	for _, s := range ss {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func mapSex(s string) string {
	lower := strings.ToLower(s)
	if strings.HasPrefix(lower, "m") {
		return "M"
	}
	if strings.HasPrefix(lower, "f") {
		return "F"
	}
	if s != "" {
		return string(s[0])
	}
	return ""
}

// ─── HTTP Handlers ────────────────────────────────────────────────────────────

func Handler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req TransformRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(TransformResponse{Success: false, Error: "Invalid JSON: " + err.Error()})
		return
	}

	if req.Payload == nil || req.Direction == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(TransformResponse{Success: false, Error: "Missing payload or direction"})
		return
	}

	result := fallbackTransform(req.Payload, req.Direction)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(TransformResponse{
		Success: true,
		Data:    result,
		Model:   "Go Deterministic Mapper v1.0",
	})
}

// ─── EOF ──────────────────────────────────────────────────────────────────────
