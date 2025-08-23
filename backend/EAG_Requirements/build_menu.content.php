<?php

// To be called by framework only
if (!defined('WEB_ROOT')) {
    exit();
}

define("MENU_SCAN_PATTERN","*.php"); // Exclude files beginning with . _ ending with '.content.php', '.text.php' or '.config.php
define("MENU_EXCLUDE_PATTERN","/^[._]{1}.*|.*\.text\.php$|.*\.content\.php$|.*\.config\.php$/");
define("MENU_ENTRY_ELEMENT",'$menuEntry');
define("MENU_CATEGORY_DELIMITER",'>');
define("MENU_ENTRY_EXTRACT_REGEX",'/[\'"](.*)[\'"]/'); // Group one matches $menuEntry string to extract
define("MENU_ENTRY_DEFAULT_SORT_TAG",'____+'); // Applied to menu entries without sort tags
define("MENU_ENTRY_EXCLUDE_SORT_REGEX",'/^[0-9A-Za-z]{4}\\+.*/'); // Sort values matching this regex are not altered
define("MENU_ENTRY_STRIP_SORT_DEFAULT_REGEX",'/^_{4}\\+(.*)/'); // Sort values matching group one are removed
define("MENU_ENTRY_STRIP_SORT_ALL_REGEX",'/^.{4}\\+(.*)/'); // Sort values matching group one are removed
define("MENU_ENTRY_MAX_LINES",'25'); // Maximum search depth when reading files

$lineNo = 0;
$menuArray = array();
$menuEntryString = '';
$menuUL = '';

// Scan webroot for page definition files and process each
// Build a nested array structure suitable for further processing
// into a nested ul tag structure for use by jQuery.treeview
foreach (glob(MENU_SCAN_PATTERN) as $fileName) {

    if (preg_match(MENU_EXCLUDE_PATTERN, $fileName) > 0) {
        continue;
    }

    // Scan each file for lines containing MENU_NAME_ELEMENT value (from framework.config.php
    $fileArray = file($fileName);
    $lineNo = 0;
    $menuEntryString = '';

    foreach($fileArray as $line) {

        $lineNo++;

        // Limit search to MENU_ENTRY_MAX_LINES
        if ($lineNo > MENU_ENTRY_MAX_LINES) {
            break;
        }

        // Process selected line
        if(stristr($line, MENU_ENTRY_ELEMENT) && (preg_match(MENU_ENTRY_EXTRACT_REGEX, $line, $matchArray))) {
            $menuEntryString = $matchArray[1];

            if (strlen($menuEntryString) == 0) {
                // Skip this $menuEntry line
                continue;
            }

            // Explode $menuEntryString string into an array
            $menuCategoryArray = explode(MENU_CATEGORY_DELIMITER, $menuEntryString);

            // Add default sort value
            $menuCategoryArray = addToArrayValue($menuCategoryArray, MENU_ENTRY_DEFAULT_SORT_TAG, MENU_ENTRY_EXCLUDE_SORT_REGEX);

            // Create URL at end of $menuCategoryArray
            $menuCategoryArray[] = WEB_ROOT . $fileName;

            // Convert flat, numeric $menuCategoryArray to a nested, named array
            $menuCategoryArray = buildNestedArray($menuCategoryArray);

            // Merge $menuNestedArray into $menuArray
            $menuArray = mergeArrays($menuArray, $menuCategoryArray);
        } else {
            // If MENU_ENTRY_ELEMENT has been found at least once, and
            // the next line does not contain another MENU_ENTRY_ELEMENT
            // - process the next file.
            // Multiple MENU_ENTRY_ELEMENT variables must be on consecutive lines.
            if (strlen($menuEntryString) > 0) {
                break;
            }
        }
    }
}

// Sort $menuArray in ascending, alpha order
deep_ksort($menuArray, SORT_ASC, SORT_STRING);

// Display menu with sort tags in place for debugging
echo arrayToUL($menuArray, 'menu-confirmation', 'none', MENU_ENTRY_STRIP_SORT_DEFAULT_REGEX, MENU_LIST_INDENT);

// Generate nested ul structure to appear on web pages, sort tags removed
$menuUL = arrayToUL($menuArray, MENU_CATEGORY_LIST_ID, MENU_CATEGORY_LIST_STYLE, MENU_ENTRY_STRIP_SORT_ALL_REGEX, MENU_LIST_INDENT);

// Write nested ul structure to disk
file_put_contents(MENU_LIST_FILE_NAME, $menuUL);


/* functions */

/**
 * deep_ksort
 *
 * Sort a multi-dimensional array by key
 *
 * Sort flags - see: http://www.php.net/manual/en/function.sort.php
 *
 *      SORT_REGULAR - compare items normally (don't change types)
 *      SORT_NUMERIC - compare items numerically
 *      SORT_STRING - compare items as strings
 *      SORT_LOCALE_STRING - compare items as strings, based on the current locale. Requires PHP 4.4.0+ or 5.0.2+
 *      SORT_NATURAL - compare items as strings using "natural ordering" like natsort(). Requires PHP 5.4.0+
 *      SORT_FLAG_CASE - bitwise OR with SORT_STRING or SORT_NATURAL for case insensitive sort. Requires PHP 5.4.0+
 *
 * @param $array - The (optionally) nested array to be sorted by key
 * @param $order - SORT_ASC or SORT_DESC - Optional but required if sort flags are provided
 * @param String, ... - variable length list of sort flags
 *
 */
function deep_ksort(array &$array, $order = SORT_ASC) {

    $sortFlags = 0;

    // Process a variable argument list
    $args = func_num_args();
       if ($args > 2) {
           $arg_list = func_get_args();
           for ($i = 2; $i < $args; $i++) {
               $sortFlags = $sortFlags | $arg_list[$i];
           }
       }

    // Sort the current array level by key in the indicated order
    if ($order == SORT_DESC) {
        krsort($array, $sortFlags);
    } else {
        ksort($array, $sortFlags);
    }

    // Recurs into lower level if it is an array containing elements
    foreach ($array as &$element) {
        if (is_array($element) && !empty($element)) {

            // Call this function on lower level
            deep_ksort($element, $order, $sortFlags);
        }
    }
}

/**
 * addToArrayValue
 *
 * Prepend the provided string to each value in an array
 * keys are not modified
 * Values beginning with $excludeRegex are not altered
 *
 * @param $array - single dimensional array to be operated on
 * @param $addString - The string to add to each eligible value
 * @param $excludeRegex - A PCRE regex - matched values are not altered
 * @return array - a modified array
 */
function addToArrayValue($array, $addString, $excludeRegex) {

    $tempArray = array();

    foreach ($array as $key => $value) {

        if(preg_match($excludeRegex, $value, $matchArray)) {
            // The value has the desired string, pas it as-is
            $tempArray[$key] = $value;
        } else {
            $tempArray[$key] = $addString.$value;
        }
    }
    return $tempArray;
}

/**
 * stripSortTags
 *
 * 1. By default, strings with leading sort tags '0000+ are returned minus the sort tag
 * 2. By default, valid sort tags contain four characters separated by a plus sign 0000+
 * 3. Strings without sort tags. or with invalid sor tags, are returned unaltered
 * 4. What constitutes a valid sort tag can be altered by providing a suitable regex
 *
 * @param string $taggedString - A single line string, possibly beginning with a sort tag
 * @param string $regex - A PCRE regular expression - group one is returned, the rest is
 *        discarded. Alternatively, a regex with a back reference group may be provided
 * @return string - regex group one, or the entire taggedString if there is no match
 */
function stripSortTags($taggedString, $regex = '/^.{4}\\+(.*)/') {

    if (preg_match($regex, $taggedString, $regs)) {
    	$result = $regs[1];
    } else if (substr($taggedString, 0, 5) == $regex) {
        $result = substr($taggedString, 5);
    } else {
    	$result = $taggedString;
    }

    return $result;
}

/**
 * buildNestedArray
 *
 * Build a single-branch, multi-dimensional array structure,
 * combining the last two elements into a link
 *
 * @param $items - Menu categories in a flat array ending with link and URL
 * @param int $recurs - Recursion level, used internally
 * @return array - A nested array structure, one level per item
 */
function buildNestedArray(array $items, $recurs = 0 ) {

    $tempArray = array();

    $tempArray[$items[$recurs]] = array();

    if (isset($items[$recurs + 2])) {
        // Call recursively to process next level
        $children =  buildNestedArray($items, $recurs + 1);
    }

    if( isset($children) ) {
        // Append child element as array key
        $tempArray[$items[$recurs]] = $children;
    } else {
        // Append last element as the value of it's predecessor
        $tempArray[$items[$recurs]] = $items[$recurs + 1];

    }

    return $tempArray;
}


/**
 * mergeArrays
 *
 * Add source key-value pairs to target
 * If source key exists in target, add new item(s) under it
 * If source key dose not exist in target, create it
 *
 * @param $targetArray - Array containing the merged result
 * @param $sourceArray - Array to be merged with target
 * @return array - Resulting array with data merged from target and source
 */
function mergeArrays(array $targetArray, array $sourceArray) {

  // Add source key-value pairs to target
  foreach($sourceArray as $key => $Value)
  {
    if(array_key_exists($key, $targetArray) && is_array($Value)) {
        // If source key exists in target, recurs to add new item(s) under it
        $targetArray[$key] = mergeArrays($targetArray[$key], $sourceArray[$key]);
    } else {
        // If source key dose not exist in target, create it
        $targetArray[$key] = $Value;
    }
  }

  return $targetArray;
}


/**
 * arrayToUL
 *
 * Returns a nested UL from a multi-dimensional array, suitable for use by jQuery.treeview
 *
 * Array requirements
 * 1. Category labels are read from key names, their value is always another array
 * 2. Link entries require a key name which becomes the link text
 * 3. Link entries require a key value which becomes the link href
 *
 * @param $array $array - Multi-dimensional array input
 * @param string $listID - id value for top level ul
 * @param string $listStyle - class value for top level ul, see jQuery.treeview docs
 * @param $stripSortTags - Optional, a character sequence or regex, matches are removed
 * @param string $initialIndent - Indent string placed before each line of the ul structure
 * @param int $recurs - Recursion counter, only used internally
 * @return string - Nested UL structure suitable for enhancement by jQuery.Treeview
 */
function arrayToUL(array $array, $listID = 'navigation', $listStyle = 'bullets', $stripSortTags = '', $initialIndent = '', $recurs = 0) {

    $newLine = "\n";

    // Setup list style class on the first pass only
    if ($recurs == 0) {
        $listStyle = 'treeview-' . strtolower($listStyle);
    }

    // Max ul nesting level is 1/2 $MAX_RECURS
    $MAX_RECURS = 10;
    $ul = null;
    $indentStr = '  ';
    $ulIndent = $initialIndent . str_repeat($indentStr, $recurs);
    $liIndent = $initialIndent . str_repeat($indentStr, $recurs + 1);

    if ($recurs > $MAX_RECURS) {
        // Prevent infinite recursion
        return '';
    }

    if ($recurs == 0)
    {
        // First pass initialization, open the outer UL
        $ul = "<ul id=\"{$listID}\" class=\"{$listStyle}\">$newLine";
    } else {
        // Open nested ul
        $ul = $ulIndent . "<ul>$newLine";
    }

    // Loop through the array to build the li elements
    foreach($array as $key => $value) {

        if(!is_array($value) && strlen($value) > 0) {
            // If the member has a value, create it as a link in an li
            $menuString = stripSortTags($key, $stripSortTags);
            $ul .= $liIndent . "<li><a href=\"" . $value . "\">" . $menuString . "</a></li>$newLine";
        }
        else if(is_array($value)) {
            // If the member is another array, write $key as a new category
            $menuString = stripSortTags($key, $stripSortTags);
            $ul .= $liIndent . "<li><span>" . $menuString . "</span>$newLine";

            // Pass the member back to this function to start a new ul
            $ul .= arrayToUL($value, $listID, $listStyle, $stripSortTags, $initialIndent, $recurs + 2);

            // Close the li
            $ul .= $liIndent . "</li>$newLine";
        }
    }

    // Close the ul and return
    $ul .= $ulIndent . "</ul>$newLine";

    return $ul;
}

?>