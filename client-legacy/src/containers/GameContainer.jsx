import React from "react"
import { Button, Modal, FormGroup, FormControl } from "react-bootstrap"
import Board from "../components/Board"
import PlayerStats from "../components/PlayerStats"
import Dice from "../components/Dice"
import Player from "../models/Player"
import End from "../components/End"
import Buy from "../components/Buy"
import PropertyStats from "../components/PropertyStats"
import Escape from "../components/Escape"

class GameContainer extends React.Component{

  constructor(props){
    super(props)
    this.state = {
      squares: this.props.properties,
      chanceCards: this.props.chance,
      chestCards: this.props.chest,
      moveValue: null,
      activePlayer: null,
      activePlayerIndex: null,
      rolled: false,
      won: false,
      showNewGameModal: true
    }

    this.playerNames = []
    this.players = []
  }

  startGame(){
    if (this.playerNames.length < 2) {
      alert("Please add at least two players")
    }
    else {
      this.playerNames.forEach(name => {
        if (name){
          let player = new Player(name)
          this.players.push(player)
        }
      })
   
      this.setState({chanceCards: this.shuffle(this.state.chanceCards),
        chestCards: this.shuffle(this.state.chestCards),
        moveValue: null,
        activePlayer: this.players[0],
        activePlayerIndex: 0,
        won: false,
        showNewGameModal: false})
    }
  }

  shuffle(a){
    const shuffledArray = [...a]
    for (let i = shuffledArray.length; i; i--) {
      let j = Math.floor(Math.random() * i);
      [shuffledArray[i - 1], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i - 1]];
    }
    return shuffledArray
  }

  updateActivePlayer(){
    if (!this.state.activePlayer) {
      return
    }
    if (this.state.rolled){
      this.setState({activePlayer: this.players[(this.state.activePlayerIndex + 1) % (this.players.length)], 
                     activePlayerIndex: (this.state.activePlayerIndex + 1) % (this.players.length),  
                     rolled: !this.state.rolled,
                     moveValue: null})
    }
  }

  setMoveValue(newValue){
    this.setState({moveValue: newValue})
  }

  updatePlayerPosition(moveValue,double){
    if (!this.state.activePlayer) {
      return
    }
    if (double && this.state.activePlayer.inJail){
      this.state.activePlayer.leaveJailWithDouble()
    }
    else{
      this.state.activePlayer.updatePosition(moveValue)
      this.checkSpecialSquare()
      this.payRentIfDue()
      this.checkBankruptcy()
    }
  }

  updateRolled(){
    this.setState({rolled: !this.state.rolled})
  }

  purchaseProperty(){
    if (!this.state.activePlayer) {
      return
    }
    let currentPlayer = this.state.activePlayer
    
    let currentSquare = this.state.squares[currentPlayer.position]

    if (currentPlayer.money < currentSquare.value){
      alert("Not enough money to purchase that")
    }
    else if (currentSquare.owner){
      alert("Someone already owns this property")
    }
    else if (!currentSquare.value){
      alert("You can't buy this type of property")
    }
    else {
      currentPlayer.properties.push(currentSquare)
      currentSquare.owner = currentPlayer
      currentPlayer.payForProperty(currentSquare)

      if (currentSquare.group === "station"){
        let stations = currentPlayer.checkCompleteGroupOwned(currentSquare).group
        stations.forEach((station) => {
          station.rentIndex = stations.length - 1
        })
      }
      else if (currentSquare.group === "utility"){
        let utilityCount = currentPlayer.countPropertiesInGroup(currentSquare)
        currentSquare.rentIndex = utilityCount
      }
    }
  }

  payRentIfDue(){
    let currentPlayer = this.state.activePlayer

    let currentSquare = this.state.squares[currentPlayer.position]

    if (currentSquare.group === "tax"){
      currentPlayer.payRent(currentSquare)
    }
    else if (currentSquare.group === "utility" && currentSquare.owner){
      currentPlayer.money -= (currentSquare.rentValues[currentSquare.rentIndex] * this.state.moveValue)
      currentSquare.owner.money += (currentSquare.rentValues[currentSquare.rentIndex] * this.state.moveValue)
    }
    else{
      if (!currentSquare.owner || currentSquare.owner === currentPlayer){
        return
      }
      else{
        // console.log(property)
        let groupCheck = currentSquare.owner.checkCompleteGroupOwned(currentSquare).check
        console.log(groupCheck)

        if (groupCheck && currentSquare.rentIndex === 0){
          currentSquare.rentIndex += 1
        }

        currentPlayer.payRent(currentSquare)
        currentSquare.owner.receiveRent(currentSquare)
      }
    }
  }


  checkCardSquare(square){

    let chanceCard

    if (square.group === "bonus" && square.name === "Chance"){
      let card = this.state.chanceCards.shift()
      console.log(card)
      card.applyMethod(this.state.activePlayer)
      this.state.chanceCards.push(card)
      alert("Landed on " + square.name + "\n" + "\n" + card.text)
    }
    else if (square.group === "bonus" && square.name === "Community Chest"){
      let card = this.state.chestCards.shift()
      console.log(card)
      
      if (card.text === "It is your birthday, collect £10 from each player"){
        this.state.activePlayer.money += 10
        this.players.forEach((player) => {
          if (player !== this.state.activePlayer){
            player.money -= 10
          }
        })
        this.state.chestCards.push(card)
        alert("Landed on " + square.name + "\n" + "\n" + card.text)
      }

      else if (card.text === "Pay a £10 fine (cancel) or take a Chance (OK)"){
        if (confirm("Landed on " + square.name + "\n" + "\n" + card.text) == true){
          chanceCard = this.state.chanceCards.shift()
          chanceCard.applyMethod(this.state.activePlayer)
          this.state.chanceCards.push(chanceCard)
          alert(chanceCard.text)
        }
        else {
          this.state.activePlayer.money -= 10
        }
        this.state.chestCards.push(card)
      }


      else {
        card.applyMethod(this.state.activePlayer)
        this.state.chestCards.push(card)
        alert("Landed on " + square.name + "\n" + "\n" + card.text)
      }
    }
  }

  checkSpecialSquare(){

    let currentPlayer = this.state.activePlayer

    let currentSquare = this.state.squares[currentPlayer.position]

    this.checkCardSquare(currentSquare)

    if (currentSquare.name === "Go To Jail"){
      alert("Go to jail!")
      currentPlayer.goToJail()
    }

  }


  checkBankruptcy(){
    let currentPlayer = this.state.activePlayer

    let funds = currentPlayer.checkFunds()

    if (funds < 0){
      alert(currentPlayer.name + " is bankrupt!")
      this.setState({won: true})
    }
  }

  handleEscapeClick(){
    if (!this.state.activePlayer) {
      return
    }
    this.state.activePlayer.leaveJail()
  }



  flipModalState(){
   this.setState({showNewGameModal: !this.state.showNewGameModal})
  }


  clearPlayerDetails(){
    this.playerNames = []
    this.players = []
    this.flipModalState()
  }

  confirmNewGame(){
    if (!this.state.activePlayer){
      this.flipModalState()
    }
    else {
      const check = confirm("Are you sure you want to start a new game?")
      if (check) {
        this.clearPlayerDetails()
      }
    }
  }

  render(){

    let currentSquare = null

    let currentPlayer = this.state.activePlayer

    if (currentPlayer){
      currentSquare = this.state.squares[currentPlayer.position]
    }


    return(
      <div className="container-div" >
      <h1>Monopoly!</h1>
      <Button onClick={this.confirmNewGame.bind(this)}>New Game</Button>
      <Board 
        squares={this.state.squares}
        players={this.players}
        player={this.state.activePlayer}
        property={currentSquare}
        purchaseClick={this.purchaseProperty.bind(this)}
        escapeClick={this.handleEscapeClick.bind(this)}
        moveValue={this.state.moveValue} 
        setMoveValue={this.setMoveValue.bind(this)}
        updatePlayerPosition={this.updatePlayerPosition.bind(this)}
        rolled={this.state.rolled}
        won={this.state.won}
        updateRolled={this.updateRolled.bind(this)}
        updateActivePlayer={this.updateActivePlayer.bind(this)}/>

        <Modal
          show={this.state.showNewGameModal}
          onHide={this.flipModalState}
          container={this}>
          <Modal.Header>
            <Modal.Title>Player Setup</Modal.Title>
          </Modal.Header>

          <Modal.Body>
            <form>
              <FormGroup>
                <FormControl type="text" onChange={(e) => {this.playerNames[0] = e.target.value}} placeholder="Player 1"/>
              </FormGroup>
              <FormGroup>
                <FormControl type="text" onChange={(e) => {this.playerNames[1] = e.target.value}} placeholder="Player 2"/>
              </FormGroup>
              <FormGroup>
                <FormControl type="text" onChange={(e) => {this.playerNames[2] = e.target.value}} placeholder="Player 3"/>
              </FormGroup>
              <FormGroup>
                <FormControl type="text" onChange={(e) => {this.playerNames[3] = e.target.value}} placeholder="Player 4"/>
              </FormGroup>
              <FormGroup>
                <FormControl type="text" onChange={(e) => {this.playerNames[4] = e.target.value}} placeholder="Player 5"/>
              </FormGroup>
              <FormGroup>
                <FormControl type="text" onChange={(e) => {this.playerNames[5] = e.target.value}} placeholder="Player 6"/>
              </FormGroup>
            </form> 
          </Modal.Body>

          <Modal.Footer>
            <Button onClick={this.startGame.bind(this)}>Start Game</Button>
          </Modal.Footer>
        </Modal>
      </div>
      )
  }

}


export default GameContainer
