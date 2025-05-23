import json

def filter_geojson_for_state(input_filepath, output_filepath, state_property_name, state_identifier):
    """
    Filters a GeoJSON FeatureCollection to include only features matching a specific state/province.

    Args:
        input_filepath (str): Path to the input GeoJSON file.
        output_filepath (str): Path to save the filtered GeoJSON file.
        state_property_name (str): The key in feature.properties that holds the state/territory name.
        state_identifier (str): The string value that identifies the desired state/province.
    """
    try:
        with open(input_filepath, 'r', encoding='utf-8') as f:
            geojson_data = json.load(f)
    except FileNotFoundError:
        print(f"Error: Input file not found at {input_filepath}")
        return
    except json.JSONDecodeError:
        print(f"Error: Could not decode JSON from {input_filepath}. Ensure it's valid JSON.")
        return
    except Exception as e:
        print(f"An unexpected error occurred while reading the input file: {e}")
        return

    if not isinstance(geojson_data, dict):
        print(f"Error: GeoJSON data is not a dictionary (root object). Found type: {type(geojson_data)}")
        return

    features_to_keep = []
    input_features = [] # Initialize to handle cases where 'features' might be missing
    
    if geojson_data.get('type') == 'FeatureCollection':
        if 'features' not in geojson_data or not isinstance(geojson_data['features'], list):
            print("Error: GeoJSON FeatureCollection is missing 'features' array or it's not a list.")
            return
        
        input_features = geojson_data['features']
        print(f"Processing {len(input_features)} features from FeatureCollection: {input_filepath}...")
    elif geojson_data.get('type') == 'Feature':
        input_features = [geojson_data]
        print(f"Processing a single Feature object from: {input_filepath}...")
    elif geojson_data.get('type') in ['Polygon', 'MultiPolygon', 'LineString', 'MultiLineString']:
        print(f"Warning: Input GeoJSON is a single Geometry of type '{geojson_data.get('type')}'. Property filtering is not applicable.")
        # Outputting as an empty feature collection as no properties to filter on.
    else:
        print(f"Error: Input GeoJSON is not a valid FeatureCollection or a single Feature. Found type: {geojson_data.get('type')}")
        return

    kept_count = 0
    if input_features: # Only iterate if we have features
        for i, feature in enumerate(input_features):
            if (i + 1) % 10000 == 0: # Progress for very large files
                print(f"Processed {i + 1}/{len(input_features)} features...")

            if isinstance(feature, dict) and 'properties' in feature and isinstance(feature['properties'], dict):
                state_name = feature['properties'].get(state_property_name)
                if state_name and isinstance(state_name, str) and state_identifier.lower() in state_name.lower():
                    features_to_keep.append(feature)
                    kept_count += 1
            # else:
                # print(f"Warning: Feature {i} is missing 'properties', 'properties' is not a dictionary, or feature itself is not a dictionary.")

    if not features_to_keep and input_features: # Check if input_features was populated before saying "no features found"
        print(f"No features found where properties.{state_property_name} contains '{state_identifier}'.")
    elif features_to_keep:
         print(f"Found and kept {kept_count} features for '{state_identifier}'.")


    output_geojson = {
        "type": "FeatureCollection",
        "name": f"{state_identifier}_filtered_coastline",
        "features": features_to_keep
    }

    try:
        with open(output_filepath, 'w', encoding='utf-8') as f:
            json.dump(output_geojson, f) 
        print(f"Successfully filtered GeoJSON and saved to {output_filepath}")
        if not features_to_keep and input_features:
             print(f"Note: The output file will be an empty FeatureCollection as no matching features were found.")
    except Exception as e:
        print(f"An error occurred while writing the output file: {e}")

if __name__ == '__main__':
    input_file = 'static/aus-coast.geojson' 
    output_file = 'static/nsw_coast_filtered.geojson'

    # --- Updated based on user's GeoJSON snippet ---
    property_key_for_state = "STE_NAME21"
    value_for_nsw = "New South Wales"
    # --- End updated settings ---

    print(f"Attempting to filter '{input_file}' for features where properties.{property_key_for_state} contains '{value_for_nsw}'.")
    filter_geojson_for_state(input_file, output_file, property_key_for_state, value_for_nsw)