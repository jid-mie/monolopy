import React from "react"
import {Button} from "react-bootstrap"

class Dice extends React.Component{

  constructor(props){
    super(props)
    this.handleClick = this.handleClick.bind(this)
    this.state = {
      doubleMessage: ""
    }
  }

  getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  handleClick(){
    if (this.props.disabled) {
      return
    }
    if (!this.props.rolled && !this.props.won){
      this.setState({doubleMessage: ""})
      let diceOneValue = this.getRandomInt(1,6)
      let diceTwoValue = this.getRandomInt(1,6)
      let newValue = diceOneValue + diceTwoValue
      this.props.setMoveValue(newValue)
      if (diceOneValue === diceTwoValue){
        this.props.updatePlayerPosition(newValue,true)
      }
      else{
        this.props.updatePlayerPosition(newValue)
      }
      if (diceOneValue !== diceTwoValue){
        this.props.updateRolled()
      }
      else{
        this.setState({doubleMessage: "Rolled double " + diceOneValue + ", roll again"})
      }
    }

  }

  render(){
    return(
      <div className="dice-div">
        <Button onClick={this.handleClick} disabled={this.props.disabled}>Roll Dice</Button>
        <p style={{marginBottom: "5px"}}>You rolled: {this.props.moveValue}</p>
        <p style={{marginTop: "5px", marginBottom: "5px"}}>{this.state.doubleMessage}</p>
      </div>
    )
  }



}

export default Dice
