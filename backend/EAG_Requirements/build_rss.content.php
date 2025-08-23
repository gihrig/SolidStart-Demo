<?php

// To be called by framework only
if (!defined('WEB_ROOT')) {
    exit();
}

$newLine = "\n";
$catContent = '';
$sectionSeparator = '';
$buildRSS = false;
$feedCount = 0;
$rejectCount = 0;
$rssStamp = 0;
$rssItem = array();

// Tamper resistant authentication
if (isset($_SESSION['salt']) && isset($_POST['sha_key_text']) &&
        sha1(sha1(RSS_PRODUCT_FEED_AUTH_KEY) . $_SESSION['salt']) == $_POST['sha_key_text']) {
    $buildRSS = true;
}

if ($buildRSS == false) {
    // Display login form

    // Build authentication message
    if (isset($_POST['sha_key_text'])) {
        $authMessage = "<h2>Enter your authorization key to build the RSS feed.</h2>\n";
        $authMessage .= "<h3 style=\"color: red;\">Invalid Authorization Key</h3>\n";
    } else {
        $authMessage = "<h2>Enter your authorization key to build the RSS feed.</h2>\n";
    }


    // Generate key salt
    $_SESSION['salt'] = sha1(session_id() . time());

    // Display authentication prompt
    require_once('./scripts/form.class.php');

    $sectionSeparator = '<hr />';

    $formObj = new form;
    //$id, $action, $method, $class='', $add=''
    $authForm = $formObj->form_start('auth_form', WEB_ROOT . 'build_rss.php', 'post', 'auth_form');
    //$name,$value='',$add=''
    $authForm .= $formObj->form_hidden('sha_key_text', '');
    $authForm .= $formObj->form_hidden('key_val', $_SESSION['salt']);
    //$name_txt,$name,$length,$value='',$add='',$dps=''
    $authForm .= $formObj->form_password('Key', 'key_text', 20);
    //$subVal, $submitjs='', $subName, $subClass, $resVal='', $resetjs='', $resName, $resClass
    $authForm .= $formObj->form_go('Build RSS');
    $authForm .= $formObj->form_end();

    // Process authentication template
    $catContent .= <<<authtpl
{$newLine}            <div class="product" style="margin: 2em 0 40em 0;">
          <div class="prodtext">
            <h1>
              Login
            </h1>
            {$authMessage}
            {$authForm}
          </div> <!-- class="prodtext" -->
          {$sectionSeparator}
        </div> <!-- class="product" -->
authtpl;

    echo($catContent);


} else {
    // $buildRSS == true - Process RSS feed

    // Clear authentication fingerprint
    unset($_POST['key_text']);
    unset($_POST['sha_key_text']);
    unset($_SESSION['salt']);

    require_once('./scripts/config.class.php');

    // Scan webroot for text database files and process each
    foreach (glob(RSS_PRODUCT_FEED_SCAN_PATTERN) as $filename) {
        if (preg_match(RSS_PRODUCT_FEED_EXCLUDE_PATTERN, $filename) > 0) {
            continue;
        }

        // create new ConfigMagik-Object
        $config = new ConfigMagik('./' . $filename, false, true);
        $catalog = $config->getConfig();

        foreach ($catalog as $section => $property) {

            // Process item if rssPublish="true"
            if (isset($property['rssPublish']) && strtolower($property['rssPublish']) == 'true') {

                // Process dependent items
                $inherited = false;
                if ('-inherit' == strtolower(substr($section, -8))) {
                    $inherited = true;
                    $sectionID = substr($section, 0, strlen($section) - 8);

                    // Open master *.test.php file and return master section (item)
                    $masterConfig = new ConfigMagik('./' . $property['source'], false, true);
                    $masterSection = $masterConfig->get(null, $sectionID);

                    // Merge dependent data into master
                    foreach ($property as $prop => $value) {
                        $masterSection[$prop] = $value;
                    }

                    // Replace dependent with merged master
                    $property = $masterSection;
                }

                // Skip items with no itemID
                if (!isset($property['itemID']) || strlen($property['itemID']) == 0) {
                    continue;
                };

                // Count items actually processed
                $feedCount++;

                // Initialize template section variables
                // rssTitle
                if (isset($property['rssTitle']) && strlen($property['rssTitle']) > 0) {
                    $rssTitle = $property['rssTitle'];
                } else {
                    // alternate = item title
                    $rssTitle = $property['title'];
                }

                // rssDate
                if (isset($property['rssDate']) && strlen($property['rssDate']) > 0) {
                    $rssStamp = strtotime($property['rssDate']);
                    $rssDate = date("F d Y g:i A", $rssStamp);
                } else {
                    // Alternate = thumbnail file date
                    $rssDate = '';
                    if (file_exists($property['imageURL'])) {
                        $rssStamp = filemtime($property['imageURL']);
                        $rssDate = date("F d Y h:i A", $rssStamp);
                    }
                }

                // rssLink
                if (preg_match('/(.*)text\\.php/', $filename, $matches)) {
                    $rssLink = WEB_ROOT.$matches[1].'php#'.$property['itemID'];
                } else {
                    $rssLink = WEB_ROOT;
                }

                // rssDescription
                if (isset($property['rssDescription']) && strlen($property['rssDescription']) > 0) {
                    $rssDescription = $property['rssDescription'];
                } else {
                    // Alternate = item description
                    $rssDescription = rtrim($property['description'], ' <>bBrR/\t\n\r\0\x0B');
                    $delimiter = '&nbsp;<a href="'.$rssLink.'">[more...]</a>';
                    $wordCount = str_word_count($rssDescription, 1, '1234567890.,;:"\'<>[]{}-_+=|/\\~`!@#$%^&*()');
                    array_splice($wordCount, RSS_PRODUCT_DESCRIPTION_WORDS);
                    $rssDescription = implode($wordCount, ' ') . $delimiter;
                }

                // Build a 2 dimensional array of rss items
                $rssData = array("rssTitle"=>"$rssTitle", "rssDate"=>"$rssDate", "rssDescription"=>"$rssDescription", "rssLink"=>"$rssLink");
                $arrayKey = $rssStamp.'-'.$property['itemID'];
                $rssItem[$arrayKey] = $rssData;
            }
        }
    }

    // Build an RSS2 Feed
    if (count($rssItem) > 0) {
        // Sort feed items in descending date order and limit max items
        krsort($rssItem);
        array_splice($rssItem, RSS_PRODUCT_FEED_COUNT);

        // Create feed channel
        include("./scripts/FeedWriter.php");
        include("./scripts/FeedItem.php");
        $feedChannel = new FeedWriter(RSS2);
        $feedChannel->setTitle(RSS_PRODUCT_FEED_TITLE);
        $feedChannel->setLink(WEB_ROOT);
        $feedChannel->setAtomLink(RSS_PRODUCT_FEED_URL);
        $feedChannel->setDescription(RSS_PRODUCT_FEED_DESCRIPTION);
        $feedChannel->setImage(RSS_PRODUCT_FEED_TITLE,WEB_ROOT,RSS_PRODUCT_FEED_IMAGE);
        $feedChannel->setChannelElement('language', 'en-us');
        $feedChannel->setChannelElement('pubDate', date(DATE_RSS, time()));

        // Build list of feed items and add to feed channel
        $feedItem = $feedChannel->createNewItem();
        foreach ($rssItem as $key => $val) {
            $feedItem = new FeedItem();
            $feedItem->setTitle($val['rssTitle']);
            $feedItem->setLink($val['rssLink']);
            $feedItem->setDate($val['rssDate']);
            $feedItem->setDescription($val['rssDescription']);
            $feedItem->addElement('author', RSS_PRODUCT_FEED_AUTHOR);
            $feedItem->addElement('guid', $val['rssLink'], array('isPermaLink'=>'true'));
            $feedChannel->addItem($feedItem);
        }
        //Generate the feed.
        file_put_contents(RSS_PRODUCT_FEED_FILE, $feedChannel->generateFeed(true));
    }

    if (intval(RSS_PRODUCT_FEED_COUNT) < $feedCount) {
        echo('<h1 style="margin-bottom: 35em;">RSS Feed created with ' . RSS_PRODUCT_FEED_COUNT . ' of ' . $feedCount . ' items.</h1>');
    } else {
        echo('<h1 style="margin-bottom: 35em;">RSS Feed created with ' . $feedCount . ' items.</h1>');
    }
}
?>
