import React from 'react';
import ReactDOM from 'react-dom';
import GameContainer from "./containers/GameContainer"
import Card from "./models/Card"
import Property from "./models/Property"

import "../build/stylesheets/main.scss"

const property1 = new Property("Go","corner",null,[null],null)
const property2 = new Property("Old Kent Rd","brown",60,[2,4,10,30,90,160,250],50)
const property3 = new Property("Community Chest","bonus",null,[null],null)
const property4 = new Property("Whitechapel Road","brown",60,[4,8,20,60,180,320,450],50)
const property5 = new Property("Income Tax","tax",null,[200],null)
const property6 = new Property("Kings Cross Station","station",200,[25,50,100,200],null)
const property7 = new Property("The Angel, Islington","sky_blue",100,[6,12,30,90,270,400,550],50)
const property8 = new Property("Chance","bonus",null,[null],null)
const property9 = new Property("Euston Road","sky_blue",100,[6,12,30,90,270,400,550],50)
const property10 = new Property("Pentonville Road","sky_blue",120,[8,16,40,100,300,450,600],50)
const property11 = new Property("Jail","corner",null,[null],null)
const property12 = new Property("Pall Mall","pink",140,[10,20,50,150,450,625,750],100)
const property13 = new Property("Electric Company","utility",150,[0,4,10],null)
const property14 = new Property("Whitehall","pink",140,[10,20,50,150,450,625,750],100)
const property15 = new Property("N'th'land Avenue","pink",160,[12,24,60,180,500,700,900],100)
const property16 = new Property("Marylebone Station","station",200,[25,50,100,200],null)
const property17 = new Property("Bow Street","orange",180,[14,28,70,200,550,750,950],100)
const property18 = new Property("Community Chest","bonus",null,[null],null)
const property19 = new Property("M'b'r'gh Street","orange",180,[14,28,70,200,550,750,950],100)
const property20 = new Property("Vine Street","orange",200,[16,32,80,220,600,800,1000],100)
const property21 = new Property("Free Parking","corner",null,[null],null)
const property22 = new Property("Strand","red",220,[18,36,90,250,700,875,1050],150)
const property23 = new Property("Chance","bonus",null,[null],null)
const property24 = new Property("Fleet Street","red",220,[18,36,90,250,700,875,1050],150)
const property25 = new Property("Trafalgar Square","red",240,[20,40,100,300,750,925,1100],150)
const property26 = new Property("Fenchurch St Station","station",200,[25,50,100,200],null)
const property27 = new Property("Leicester Square","yellow",260,[22,44,110,330,800,975,1150],150)
const property28 = new Property("Coventry Street","yellow",260,[22,44,110,330,800,975,1150],150)
const property29 = new Property("Water Works","utility",150,[0,4,10],null)
const property30 = new Property("Picadilly","yellow",280,[22,44,120,360,850,1025,1200],150)
const property31 = new Property("Go To Jail","corner",null,[null],null)
const property32 = new Property("Regent Street","green",300,[26,52,130,390,900,1100,1275],200)
const property33 = new Property("Oxford Street","green",300,[26,52,130,390,900,1100,1275],200)
const property34 = new Property("Community Chest","bonus",null,[null],null)
const property35 = new Property("Bond Street","green",320,[28,56,150,450,1000,1200,1400],200)
const property36 = new Property("Liverpool St Station","station",200,[25,50,100,200],null)
const property37 = new Property("Chance","bonus",null,[null],null)
const property38 = new Property("Park Lane","dark_blue",350,[35,70,175,500,1100,1300,1500],200)
const property39 = new Property("Super Tax","tax",null,[100],null)
const property40 = new Property("Mayfair","dark_blue",400,[50,100,200,600,1400,1700,2000],200)

const properties = [property1,property2,property3,property4,property5,property6,property7,property8,property9,property10,property11,property12,property13,property14,property15,property16,property17,property18,property19,property20,property21,property22,property23,property24,property25,property26,property27,property28,property29,property30,property31,property32,property33,property34,property35,property36,property37,property38,property39,property40]


const chance1 = new Card("Advance to Mayfair",1,39)
const chance2 = new Card("Advance to Go",1,0)
const chance3 = new Card("Bank pays you dividend of £50",2,50)
const chance4 = new Card("Pay school fees of £150",3,150)
const chance5 = new Card("Speeding fine £15",3,15)
const chance6 = new Card("You have won a crossword competition, collect £100",2,100)
const chance7 = new Card("Your building loan matures, collect £150",2,150)
const chance8 = new Card("Get out of Jail free",4)
const chance9 = new Card("Advance to Trafalgar Square",1,24)
const chance10 = new Card("Take a trip to Marylebone Station",1,15)
const chance11 = new Card("Advance to Pall Mall",1,11)
const chance12 = new Card("Drunk in charge, fine £20",3,20)
const chance13 = new Card("Go to Jail",1,39)
const chance14 = new Card("Go back 3 spaces",1,39)
const chance15 = new Card("You are assessed for street repairs: £40 per house, £115 per hotel",3)
const chance16 = new Card("Make general repairs on all of your houses. For each house pay £25, for each hotel pay £100",3)

const chanceCards = [chance1,chance2,chance3,chance4,chance5,chance6,chance7,chance8,chance9,chance10,chance11,chance12,chance13,chance14,chance15,chance16]


const chest1 = new Card("Income tax refund, collect £20",2,20)
const chest2 = new Card("From Sale of Stock you get £50",2,50)
const chest3 = new Card("Receive interest on 7% preference shares, £25",2,25)
const chest4 = new Card("Get out of Jail free",4)
const chest5 = new Card("Advance to Go",1,0)
const chest6 = new Card("Pay hospital £100",3,100)
const chest7 = new Card("You have won second prize in a beauty contest, collect £10",2,10)
const chest8 = new Card("Bank error in your favour, collect £200",2,200)
const chest9 = new Card("You inherit £100",2,100)
const chest10 = new Card("Pay you insurance premium £50",3,50)
const chest11 = new Card("Doctor's fee pay £50",3,50)
const chest12 = new Card("Annuity matures, collect £100",2,100)
const chest13 = new Card("Go to Jail",1,39)
const chest14 = new Card("Go back to Old Kent Road",1,1)
const chest15 = new Card("It is your birthday, collect £10 from each player")
const chest16 = new Card("Pay a £10 fine (cancel) or take a Chance (OK)")

const chestCards = [chest1,chest2,chest3,chest4,chest5,chest6,chest7,chest8,chest9,chest10,chest11,chest12,chest13,chest14,chest15,chest16]

document.addEventListener("DOMContentLoaded", function () {
  ReactDOM.render(
    <GameContainer properties={properties} chance={chanceCards} chest={chestCards} />,
    document.getElementById("app")
  );
});
