;<?php exit(); ?>
;
; Catalog page configuration file
;
; Each item to appear on a catalog page begins with a sectionID enclosed in brackets []
; Details for the item follow the sectionID as data items in the form of name = details.
;
; [sectionID]        [replace with itemID-itemName], [itemID-itemName-inherit] to create a dependent item.
;
; name = "details"
; etc...
;
; SectionID's may be any string of alpha-numeric characters and are case sensitive,
;   numeric values will have leading '0's trimmed.  e.g. [001] is equal to [1].
;   Most punctuation characters are acceptable, but single/double quotes and semicolons
;   may cause problems in some environments and should be avoided. Notably, the use of the
;   single quote as an apostrophe (Richardson's) should be avoided.
; SectionID's have no significance outside of this file.
; Each sectionID must be unique [1001], [cristitha], [agate-005] etc.
; SectionID's need not be in any order, or consecutive.
; Catalog entries will appear on the page in the same order as in this file.
;
; Data items take the form of 'name = value', spaces around the equal sign are optional.
; If 'value' contains spaces or special characters, enclose it in double quotes 'name = "value with spaces" '.
; Long data items may include carriage returns for readability [PHP 5 ONLY].  These have no effect
;   on the text appearance in the catalog page. To create paragraph and line breaks, use standard
;   html mark-up. use '<p> and </p> to set off paragraphs and <br> for line breaks. See the example.
; Data item names are case sensitive e.g. itemName is valid, itemname and ItemName, etc. are not.
;
; If itemID is empty, missing or "commented out" by placing a semicolon (;) before it, the entire section will
; not appear in the catalog page.
; Certain other values may be left empty or commented out to remove the associated block from the catalog as follows:
;   imageURL - If empty or commented out, no image or 'click image to enlarge' link will be displayed.
;   price - If empty or commented out, no special shipping, item name, number, price or shopping cart buttons will be displayed.
;   sold - empty or commented out = normal display.  Text entered here will replace Add to Cart and View Cart buttons.
;   skipSeparator - If "true", the horizontal rule after the item will not appear. If "false" or missing the rule appears.
; Comments begin with a semi-colon and are ignored, comments may be used to "remove" an item or add notes after a data item.
;
; Example record with descriptive comments:
;
; [agate-001]
;
; rssPublish="true" ; "true" = include this item in RSS feed - Not if false or commented - Not inherited
; rssTitle=""       ; (uses 'title' text if empty)
; rssDate=""        ; (mm/dd/yyyy h:mm A/P format (12/29/2011 3:23 PM) uses 'imageURL' file date if empty)
; rssDescription="" ; (uses 'description' text if empty)
;
; itemName = "Christitha Agate"           ; Item name, appears on the catalog page and the shopping cart description.
; itemID = 2596                           ; Item number, appears on the catalog page and the shopping cart description.
; ;sold = "Sold - - <a href='contact.php'>Contact us</a> for additional items."  ; Remove the semicolon to mark item as sold
; title = "Most beautiful Christitha Agate we have seen!" ; Title for catalog page entry.
; description = "<p>This specimen uniquely shows off the rare and unusual 'Christitha formation',
; once said to be divinely inspired by Christ himself.</p>
; <p>The idea of Jesus Christ 'inspiring' rock formations, sounds to us more than a little far
; fetched. After all, aren't heat, pressure and molten rock formations more in the province of
; the devil?</p>
; <p>We prefer to think of this exotic crystal as having inspired the great novelist Agatha
; Christy in her detective musings, rather than being created as a supernatural or divine
; message to mankind.</p>
; <p>Regardless of all that, we think this is the most beautiful example of this rare and
; unusual formation we have found to date.</p>"
; price = 80.00                           ; Price each for this item. Comment or leave empty to remove sale info and cart buttons.
; imageURL = "catalog_images/Christitha.jpg"      ; Path/file for thumbnail shown on listing page.
; imageLgURL = "catalog_images/Christithalg.jpg"  ; Path/file for large image(s) shown from link on listing page. Comment or leave empty to remove image.
; shippingAddr = 2                        ; Shipping address at checkout: 0 = optional, 1 = don't ask, 2 = required.
; shippingAmt = ""                        ; If not empty ("") value adds to total shipping cost set in PayPal preferences.
;                                         ;   "Allow transaction-based shipping values to override the profile shipping settings"
;                                         ;   must be selected in Pay Pal profile "Shipping Calculations" section.
; skipSeparator = "false"                 ; If "true", the horizontal rule after the item will not appear. If "false" or missing the rule appears.
;
;
; Dependent items:
; ===============
; A Dependent item reads any data elements not included in the dependent from an existing (master) item.
; This permits a single item to appear in multiple locations, based on the content of a master item.
; Using dependent items allows all locations of a single item to be changed (e.g. marked as "Sold") by updating the master only.
; Master and Dependent items may be located in any ????.text.php file.
;
; To create a dependent item:
; 1. Copy the sectionID from the master item into the ????.text.php file where the dependent item is to appear.
; 2. Add a "-inherit" suffix to the sectionID to mark this new item as a dependent:
;
;      Master sectionID:     [agate-001]
;      Dependent sectionID   [agate-001-inherit]
;
; 3. Create a "source" data item specifying the location of the master item.
;
;      source = "cabochons.txt.php"
;
; 4. Create additional data items only for those that differ from the master, usually description only.
;
; Example dependent record: This will be identical to the master, with added text at the end of the description.
;   The last paragraph is unique to the dependent item.
;
; [agate-001-inherit]
;
; source = "cabochons.text.php"
;
; description = "<p>This specimen uniquely shows off the rare and unusual 'Christitha formation',
; once said to be divinely inspired by Christ himself.</p>
; <p>The idea of Jesus Christ 'inspiring' rock formations, sounds to us more than a little far
; fetched. After all, aren't heat, pressure and molten rock formations more in the province of
; the devil?</p>
; <p>We prefer to think of this exotic crystal as having inspired the great novelist Agatha
; Christy in her detective musings, rather than being created as a supernatural or divine
; message to mankind.</p>
; <p>Regardless of all that, we think this is the most beautiful example of this rare and
; unusual formation we have found to date.</p><p>Be sure to see our collection of spectacular display items (link)</p>"

; Slide Show:
; ==========
; To create a slide show that appears when an item's image is clicked, multiple images and related title/description
; text is entered for the 'imageLgURL' data item.
;
; There is a special format required for slide show entries where the image URL and title text are separated by a
; vertical bar character:
;
; imageLgURL = "catalog_images/1102-Burro_Creek_Cabochon_006.jpg|Burro Creek Agate - looks like it could actually be Pastelite|
;      catalog_images/1102-Burro_Creek_Cabochon_005.jpg|another angle|
;      catalog_images/1102-Burro_Creek_Cabochon_004.jpg|on light background|
;      catalog_images/1102-Burro_Creek_Cabochon_001.jpg|under diffused lighting"
;
; Note that there is not a vertical bar before the first, nor after the last entry.
; See [679-Jasper Cabochon] below for a complete example.

RSS Feed
========
; rssPublish="true" ; "true" = include this item in RSS feed - Not if false or commented - Not inherited
; rssTitle=""       ; (uses 'title' text if empty)
; rssDate=""        ; (mm/dd/yyyy h:mm A/P format (12/29/2011 3:23 PM) uses 'imageURL' file date if empty)
; rssDescription="" ; (uses 'description' text if empty)

Making the Most of the Marketing Opportunity
Consider making best use of the limited number of words available in the feed. The feed is composed of:
 - A title: 'title' or 'rssTitle
 - A Description: The first 24 words of the 'description' text or a custom 'rssDescription'.

;============ BEGIN - entry template - copy to new location and fill in ==============

;[sectionID]

;itemName = ""
;itemID = ""
;source = "masterFile.text.php"
;rssPublish="true"
;rssTitle=""
;rssDate=""
;rssDescription=""
;sold = "Sold - - <a href='contact.php'>Contact us</a> for additional items."
;title = ""
;description = ""
;price = ""
;imageURL = "catalog_images/"
;imageLgURL = "catalog_images/"
;shippingAddr = 2
;shippingAmt = ""

;============ END - entry template ==============

;========== Cabochons ==========

[column_header]

itemID = "header-text"
itemName = "NEWLY LISTED CABOCHONS, CUT BY ED"
title = "<h4>Go to <a href=cab-index.php>CABOCHON INDEX</a>, <a href=cabs-large.php>LARGER, OVERSIZED STONES</a>, <a href=cabs-pairs.php>PAIRS</a>, <a href=cabs-hearts.php>HEARTS</a>, <a href=cabs-agua_nueva.php>FIRST CAB PAGE</a>.<BR>This page has just a few of our newest listings of cabochons.  If you click on the Cabochon Index above, you can search through the various types of stones. We charge one shipping cost for all that will safely fit in a Small Priority Flat Rate box and will ship to the U.S. as well as Internationally. If your order requires additional shipping, we will either contact you before we ship, or you can email us for an invoice. Thanks!</h4>"
description =
skipSeparator = "false"


[679-Jasper Cabochon]

itemName = "Jasper Cabochon"
itemID = "679"
rssPublish="true"
;sold = "Sold - - <a href='contact.php'>Contact us</a> for additional items."
title = "Colorful Oval Jasper Cabochon"
description = "This is a colorful Jasper cabochon. We are not sure where the material came from, but we believe it was from the Mojave Desert of California.  It is not as bright in natural lighting as it looks in the photos, but move it into the sunlight, or other lighting, and it comes to life with color. It is 52 x 39 mm and 8 mm thick. It weighs 121 carats.  The back is lightly finished as well.<P>See more <a href=cabs-jasper_unk.php>JASPER CABOCHONS here</a>."
price = "39.50"
imageURL = "catalog_images/679-Jasper_Cabochon_sm_003.jpg"
imageLgURL = "catalog_images/679-Jasper_Cabochon_003.jpg|Colorful Oval Jasper Cabochon|
      catalog_images/679-Jasper_Cabochon_002.jpg|From an angle|
      catalog_images/679-Jasper_Cabochon_004.jpg|Lighter background|
      catalog_images/679-Jasper_Cabochon_005.jpg|Another angle"
shippingAddr = 2
shippingAmt = "5.00"
skipSeparator = "false"


[679-Jasper Cabochon-inherit]

source = "cabochons.text.php"
rssPublish="true"
description = "This is a colorful Jasper cabochon. We are not sure where the material came from, but we believe it was from the Mojave Desert of California.  It is not as bright in natural lighting as it looks in the photos, but move it into the sunlight, or other lighting, and it comes to life with color. It is 52 x 39 mm and 8 mm thick. It weighs 121 carats.  The back is lightly finished as well.  Click for additional shots: <a href=catalog_images/679-Jasper_Cabochon_002.jpg>from an angle</a>, <a href=catalog_images/679-Jasper_Cabochon_004.jpg>lighter background</a>, and <a href=catalog_images/679-Jasper_Cabochon_005.jpg>another angle</a>.<P>INHERITED - This text differs from the master..."
price = "35.00"


[1100-Condor Agate Cabochon]

itemName = "Condor Agate Cabochon"
itemID = "1100"
rssPublish="true"
;sold = "Sold - - <a href='contact.php'>Contact us</a> for additional items."
title = "Colorful Condor Agate Cabochon with Crystals"
description = "This is a cabochon cut from Condor Agate, from Patagonia, Argentina.  It's very colorful, especially beautiful under lighting. It is 32 x 46 mm and 5-6 mm thick.  Click to see more photos:  <a href=catalog_images/1100-Condor_Agate_Cabochon_002.jpg>closer photo</a>, <a href=catalog_images/1100-Condor_Agate_Cabochon_003.jpg>on an angle</a>, <a href=catalog_images/1100-Condor_Agate_Cabochon_004.jpg>under diffused lighting</a>, <a href=catalog_images/1100-Condor_Agate_Cabochon_005.jpg>closer under diffused light</a>. <P>See more <a href=cabs-condor.php>CONDOR AGATE CABOCHONS here</a>."
price = "35.00"
imageURL = "catalog_images/1100-Condor_Agate_Cabochon_sm_001.jpg"
imageLgURL = "catalog_images/1100-Condor_Agate_Cabochon_001.jpg"
shippingAddr = 2
shippingAmt = "5.00"
